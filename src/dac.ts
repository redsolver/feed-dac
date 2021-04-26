import { Buffer } from "buffer";
import { SkynetClient, MySky, JsonData } from "skynet-js";
import { ChildHandshake, Connection, WindowMessenger } from "post-me";
import { EntryType, IDictionary, IFeedDAC, IFeedDACResponse, IFilePaths, IIndex, IPage } from "./types";
import { Post, PostContent } from "./skystandards";
import stringify from "canonical-json";
import CryptoJS from "crypto-js";

// DAC consts
const DATA_DOMAIN = "skyfeed-dev.hns";

const urlParams = new URLSearchParams(window.location.search);
const DEBUG_ENABLED = urlParams.get("debug") === "true";
const DEV_ENABLED = urlParams.get("dev") === "true";

// page consts
const ENTRY_MAX_SIZE = 1 << 12; // 4kib
const PAGE_REF = "[NUM]";

// index consts
const INDEX_DEFAULT_PAGE_SIZE = 64;
const INDEX_VERSION = 1;

// ContentRecordDAC is a DAC that allows recording user interactions with pieces
// of content. There are two types of interactions which are:
// - content creation
// - content interaction (can be anything)
//
// The DAC will store these interactions across a fanout data structure that
// consists of an index file that points to multiple page files.
export default class FeedDAC implements IFeedDAC {
  protected connection: Promise<Connection>;

  private client: SkynetClient;
  private mySky: MySky;
  private paths: IFilePaths;
  private skapp: string;

  public constructor() {
    // create client
    this.client = new SkynetClient();

    // define API
    const methods = {
      init: this.init.bind(this),
      onUserLogin: this.onUserLogin.bind(this),
      createPost: this.createPost.bind(this),
      createComment: this.createComment.bind(this),
      createRepost: this.createRepost.bind(this),
    };

    // create connection
    this.connection = ChildHandshake(
      new WindowMessenger({
        localWindow: window,
        remoteWindow: window.parent,
        remoteOrigin: "*",
      }),
      methods
    );
  }

  public async init() {
    try {
      this.log("[FeedDAC] init");
      // extract the skappname and use it to set the filepaths
      const hostname = new URL(document.referrer).hostname;
      const skapp = await this.client.extractDomain(hostname);
      this.log("loaded from skapp", skapp);
      this.skapp = skapp;

      this.paths = {
        SKAPPS_DICT_PATH: `${DATA_DOMAIN}/skapps.json`,
        POSTS_INDEX_PATH: `${DATA_DOMAIN}/${skapp}/posts/index.json`,
        POSTS_PAGE_PATH: `${DATA_DOMAIN}/${skapp}/posts/page_[NUM].json`,
        COMMENTS_INDEX_PATH: `${DATA_DOMAIN}/${skapp}/comments/index.json`,
        COMMENTS_PAGE_PATH: `${DATA_DOMAIN}/${skapp}/comments/page_[NUM].json`,
      };


      this.log("[FeedDAC] loaded paths");

      // load mysky
      const opts = { dev: DEV_ENABLED };
      this.mySky = await this.client.loadMySky(DATA_DOMAIN, opts);

      this.log("[FeedDAC] loaded mysky");
    } catch (error) {
      this.log("Failed to load MySky, err: ", error);
      throw error;
    }
  }

  // onUserLogin is called by MySky when the user has logged in successfully
  public async onUserLogin() {
    this.log("onUserLogin");
    // Ensure file hierarchy will ensure the index and current page file for
    // both entry types get precreated. This should alleviate a very slow
    // `getJSON` timeout on inserting the first entry.
    this.ensureFileHierarchy()
      .then(() => {
        this.log("Successfully ensured file hierarchy");
      })
      .catch((err) => {
        this.log("Failed to ensure hierarchy, err: ", err);
      });

    // Register the skapp name in the dictionary
    this.registerSkappName()
      .then(() => {
        this.log("Successfully registered skappname");
      })
      .catch((err) => {
        this.log("Failed to register skappname, err: ", err);
      });
  }

  public async createPost(content: PostContent, mentions: string[]): Promise<IFeedDACResponse> {
    try {
      return await this.handleNewPost(EntryType.POST, content, false, null, null, null, mentions);
    } catch (error) {
      console.trace(error);
      console.log((error as Error).stack);
      this.log("createPost: Error occurred, err: ", error);
      return {
        success: false,
        error: stringify(error),
      };
    }
  }

  public async createComment(
    content: PostContent,
    commentTo: string,
    parent: Post,
    mentions: string[]
  ): Promise<IFeedDACResponse> {
    try {
      return await this.handleNewPost(EntryType.COMMENT, content, false, null, commentTo, parent, mentions);
    } catch (error) {
      this.log("createComment: Error occurred, err: ", error);
      return {
        success: false,
        error: stringify(error),
      };
    }
  }

  public async createRepost(repostOf: string, parent: Post, mentions: string[]): Promise<IFeedDACResponse> {
    try {
      return await this.handleNewPost(EntryType.POST, null, true, repostOf, null, parent, mentions);
    } catch (error) {
      this.log("createRepost: Error occurred, err: ", error);
      return {
        success: false,
        error: stringify(error),
      };
    }
  }

  // recordInteraction will record a new interaction in the content record
  /*   public async recordInteraction(...data: IContentInfo[]): Promise<IDACResponse> {
    try {
      // purposefully not awaited
      this.handleNewEntries(EntryType.INTERACTIONS, ...data);
    } catch (error) {
      this.log("Error occurred trying to record interaction, err: ", error);
    }
    return { submitted: true };
  } */

  // registerSkappName is called on init and ensures this skapp name is
  // registered in the skapp name dictionary.
  private async registerSkappName() {
    const { SKAPPS_DICT_PATH } = this.paths;
    let skapps = await this.downloadFile<IDictionary>(SKAPPS_DICT_PATH);
    if (!skapps) {
      skapps = {};
    }
    skapps[this.skapp] = true;
    await this.updateFile(SKAPPS_DICT_PATH, skapps);
  }

  // handleNewEntries is called by both 'recordNewContent' and
  // 'recordInteraction' and handles the given entry accordingly.
  private async handleNewPost(
    kind: EntryType,
    content: PostContent | null,
    isRepost: boolean,
    repostOf: string | null,
    commentTo: string | null,
    parent: Post | null,
    mentions: string[]
  ): Promise<IFeedDACResponse> {
    this.log("handleNewPost", kind);

    let index = await this.fetchIndex(kind);
    let page = await this.fetchPage<IPage>(kind, index);

    // let entriesAddedToPage = 0;

    if (page.items.length === INDEX_DEFAULT_PAGE_SIZE) {
      // TODO: optimize performance
      await this.updateFile(page._self.substring(79), page);
      index = await this.updateIndex(kind, index, page);
      page = await this.fetchPage<IPage>(kind, index);
      // entriesAddedToPage = 0;
    }

    /*     let persistence: IContentPersistence;
    try {
      persistence = this.toPersistence(entry);
    } catch (error) {
      this.log("Failed to transform entry to persistence object", error);
      continue;
    } */
    var newPost: Post = {
      id: page.items.length,
    };

    //print('repostOf $repostOf');

    // return;

    // final usersToMention = <String>[];

    // usersToMention.addAll(mentions);

    if (isRepost && repostOf !== null) {
      newPost.repostOf = repostOf;
      newPost.parentHash = "1220" + CryptoJS.SHA256(stringify(parent)).toString(CryptoJS.enc.Hex);
    } else {
      if (content === null) {
        throw new Error(`No PostContent`);
      }

      newPost.content = content;

      if (newPost.content == null) {
        newPost.content = {};
      }

      if (kind === EntryType.COMMENT && commentTo !== null) {
        newPost.commentTo = commentTo;
        newPost.parentHash = "1220" + CryptoJS.SHA256(stringify(parent)).toString(CryptoJS.enc.Hex);

        /*  usersToMention.addAll(parent.mentions ?? []); */

        // newPost.mentions = List.from(parent.mentions ?? []); // TODO Growable

        /*       if (!usersToMention.contains(parent.userId)) {
          if (!bridges.isBridgedPost(parent.userId)) {
            usersToMention.add(parent.userId);
          }
        }
        usersToMention.remove(AppState.userId); */

        // usersToMention.addAll(newPost.mentions);
      }
    }
    // newPost.mentions = usersToMention.toSet().toList();

    // print('mentions ${newPost.mentions}');

    newPost.ts = Date.now();

    /* newPost.content.postedAt = postedAt != null
        ? DateTime.fromMillisecondsSinceEpoch(postedAt)
        : DateTime.now(); */

    //    int currentPointer = pointerBox.get('${AppState.userId}/feed/$feedId') ?? 0;

    /* print('current{$feedId}Pointer $currentPointer');

    var fp =
        await feedPages.get('${AppState.userId}/feed/$feedId/$currentPointer'); */

    // String newFullPostId;

    this.log("newPost", newPost);

    page.items.push(newPost);


    this.log("page", page);

    index.latestItemTimestamp = newPost.ts;

    await Promise.all([this.updateFile(page._self.substring(79), page), this.updateIndex(kind, index, page)]);

    return {
      success: true,
      ref: page._self + "#" + newPost.id.toString(),
    };

    // if (entriesAddedToPage) {
    // }
  }

  // updateIndex is called after a new entry got inserted and will update the
  // index to reflect this recently inserted entry.
  private async updateIndex(kind: EntryType, index: IIndex, page: IPage): Promise<IIndex> {
    const indexPath = kind === EntryType.POST ? this.paths.POSTS_INDEX_PATH : this.paths.COMMENTS_INDEX_PATH;

    const pagePath = kind === EntryType.POST ? this.paths.POSTS_PAGE_PATH : this.paths.COMMENTS_PAGE_PATH;

    index.currPageNumEntries = page.items.length;

    // rotate pages if necessary
    if (index.currPageNumEntries === INDEX_DEFAULT_PAGE_SIZE) {
      index.currPageNumber += 1;
      const newPageNumStr = String(index.currPageNumber);
      const newPage = pagePath.replace(PAGE_REF, newPageNumStr);
      //index.pages.push(newPage);
    }
    await this.updateFile(indexPath, index);
    return index;
  }

  // fetchIndex downloads the index, if the index does not exist yet it will
  // return the default index.
  private async fetchIndex(kind: EntryType): Promise<IIndex> {
    const indexPath = kind === EntryType.POST ? this.paths.POSTS_INDEX_PATH : this.paths.COMMENTS_INDEX_PATH;

    const firstPagePath =
      kind === EntryType.POST
        ? this.paths.POSTS_PAGE_PATH.replace(PAGE_REF, String(0))
        : this.paths.COMMENTS_PAGE_PATH.replace(PAGE_REF, String(0));

    let index = await this.downloadFile<IIndex>(indexPath);
    if (!index) {
      index = {
        version: INDEX_VERSION,
        currPageNumber: 0,
        currPageNumEntries: 0,
        // pages: [firstPagePath],
        pageSize: INDEX_DEFAULT_PAGE_SIZE,
      };
    }
    return index;
  }

  // fetchPage downloads the current page for given index, if the page does not
  // exist yet it will return the default page.
  private async fetchPage<T>(kind: EntryType, index: IIndex): Promise<IPage> {
    const indexPath = kind === EntryType.POST ? this.paths.POSTS_INDEX_PATH : this.paths.COMMENTS_INDEX_PATH;

    const pagePath = kind === EntryType.POST ? this.paths.POSTS_PAGE_PATH : this.paths.COMMENTS_PAGE_PATH;

    const currPageStr = String(index.currPageNumber);
    const currPagePath = pagePath.replace(PAGE_REF, currPageStr);

    let page = await this.downloadFile<IPage>(currPagePath);
    if (!page) {
      page = {
        $schema: "https://skystandards.hns.siasky.net/draft-01/feedPage.schema.json",
        _self: "sky://ed25519-" + (await this.mySky.userID()) + "/" + currPagePath, // back reference to the path
        indexPath: "/" + indexPath,

        items: [],
        // TODO? version: INDEX_VERSION,
      };
    }
    return page;
  }

  // downloadFile merely wraps getJSON but is typed in a way that avoids
  // repeating the awkward "as unknown as T" everywhere
  private async downloadFile<T>(path: string): Promise<T | null> {
    this.log("downloading file at path", path);
    const { data } = await this.mySky.getJSON(path);
    if (!data) {
      this.log("no data found at path", path);
      return null;
    }
    this.log("data found at path", path, data);
    return (data as unknown) as T;
  }

  // updateFile merely wraps setJSON but is typed in a way that avoids repeating
  // the awkwars "as unknown as JsonData" everywhere
  private async updateFile<T>(path: string, data: T) {
    this.log("updating file at path", path, data);
    await this.mySky.setJSON(path, (data as unknown) as JsonData);
  }

  // ensureFileHierarchy ensures that for every entry type its current index and
  // page file exist, this ensures we do not take the hit for it when the user
  // interacts with the DAC, seeing as non existing file requests time out only
  // after a certain amount of time.
  private async ensureFileHierarchy(): Promise<void> {
    for (const entryType of [EntryType.POST, EntryType.COMMENT]) {
      const index = await this.fetchIndex(entryType);
      await this.fetchPage(entryType, index);
    }
  }

  // toPersistence turns content info into a content persistence object
  /* private toPersistence(data: IContentInfo): IContentPersistence {
    const persistence = {
      timestamp: Math.floor(Date.now() / 1000),
      ...data,
    };

    if (persistence.metadata === undefined) {
      persistence.metadata = {};
    }

    // validate the given data does not exceed max size
    const size = Buffer.from(JSON.stringify(persistence)).length;
    if (size > ENTRY_MAX_SIZE) {
      throw new Error(`Entry exceeds max size, ${length}>${ENTRY_MAX_SIZE}`);
    }

    return persistence;
  } */

  // log prints to stdout only if DEBUG_ENABLED flag is set
  private log(message: string, ...optionalContext: any[]) {
    if (DEBUG_ENABLED) {
      console.log(message, ...optionalContext);
    }
  }
}
