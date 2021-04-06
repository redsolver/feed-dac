import { SkynetClient, MySky } from "skynet-js";
import type { Connection } from "post-me";
import { IContentInfo, IIndex, IPage, IContentPersistence, INewContentPersistence, EntryType, IResult } from "./types";
import { JsonData } from "skynet-js/dist/skydb";

// consts
const DATA_DOMAIN = "contentrecord.hns"
const SKAPP_NAME = document.referrer;
const PAGE_REF = '[NUM]';

const ENTRY_MAX_SIZE = 1 << 12; // 4kib

// index consts
const INDEX_DEFAULT_PAGE_SIZE = 1000;
const INDEX_VERSION = 1;

// new content paths
const NC_INDEX_PATH = `${DATA_DOMAIN}/${SKAPP_NAME}/newcontent/index.json`
const NC_PAGE_PATH = `${DATA_DOMAIN}/${SKAPP_NAME}/newcontent/page_[NUM].json`

// content interaction paths
const CI_INDEX_PATH = `${DATA_DOMAIN}/${SKAPP_NAME}/interactions/index.json`
const CI_PAGE_PATH = `${DATA_DOMAIN}/${SKAPP_NAME}/interactions/page_[NUM].json`

// ContentRecordDAC is a DAC that allows recording user interactions with pieces
// of content. There are two types of interactions which are:
// - content creation
// - content interaction (can be anything)
//
// The DAC will store these interactions across a fanout data structure that
// consists of an "index" file that points to multiple "page" files.
export default class ContentRecordDAC {
  private mySky: MySky;

  public constructor(
    private client: SkynetClient,
    private connection: Connection,
  ) {
    this.connection.localHandle().setMethods({
      recordNewContent: this.recordNewContent.bind(this),
      recordInteraction: this.recordInteraction.bind(this),
    });
  }

  public async init() {
    this.mySky = await this.client.loadMySky(DATA_DOMAIN)
  }

  // recordNewContent will record the new content creation in the content record
  public async recordNewContent(data: IContentInfo): Promise<IResult> {
    try {
      await this.handleNewEntry(EntryType.NEWCONTENT, data);
      return { success: true }
    } catch (error) {
      console.log('Error occurred trying to record new content, err: ', error)
      return { success: false, error: typeof error === 'string' ? error : JSON.stringify(error)  }
    }
  }

  // recordInteraction will record a new interaction in the content record
  public async recordInteraction(data: IContentInfo): Promise<IResult> {
    try {
      await this.handleNewEntry(EntryType.INTERACTIONS, data);
      return { success: true }
    } catch (error) {
      console.log('Error occurred trying to record interaction, err: ', error)
      return { success: false, error: typeof error === 'string' ? error : JSON.stringify(error)  }
    }
  }

  // handleNewEntry is called by both 'recordNewContent' and 'recordInteraction'
  // and handles the given entry accordingly.
  private async handleNewEntry(kind: EntryType, data: IContentInfo) {
    const index = await this.fetchIndex(kind);

    let page = await this.fetchPage<IContentPersistence>(kind, index);
    page.entries.push(this.toPersistence(data));

    await this.updateFile(page.pagePath, page);
    await this.updateIndex(kind, index, page);
  }

  // updateIndex is called after a new entry got inserted and will update the
  // index to reflect this recently inserted entry.
  private async updateIndex(kind: EntryType, index: IIndex, page: IPage<INewContentPersistence>) { 
    const indexPath = kind === EntryType.NEWCONTENT
      ? NC_INDEX_PATH
      : CI_INDEX_PATH;
  
    const pagePath = kind === EntryType.NEWCONTENT
      ? NC_PAGE_PATH
      : CI_PAGE_PATH;
    
    index.currPageNumEntries = page.entries.length
    // rotate pages if necessary
    if (index.currPageNumEntries === INDEX_DEFAULT_PAGE_SIZE) {
      index.currPageNumber += 1
      const newPageNumStr = String(index.currPageNumber)
      const newPage = pagePath.replace(PAGE_REF, newPageNumStr);
      index.pages.push(newPage)
    }
    await this.updateFile(indexPath, index)
  }

  // fetchIndex downloads the index, if the index does not exist yet it will
  // return the default index.
  private async fetchIndex(kind: EntryType): Promise<IIndex> {
    const indexPath = kind === EntryType.NEWCONTENT
      ? NC_INDEX_PATH
      : CI_INDEX_PATH;
    
    const firstPagePath = kind === EntryType.NEWCONTENT
      ? NC_PAGE_PATH.replace(PAGE_REF, String(0))
      : CI_PAGE_PATH.replace(PAGE_REF, String(0));

    let index = await this.downloadFile<IIndex>(indexPath);
    if (!index) {
      index = {
        version: INDEX_VERSION,
        currPageNumber: 0,
        currPageNumEntries: 0,
        pages: [firstPagePath],
        pageSize: INDEX_DEFAULT_PAGE_SIZE,
      }
    }
    return index;
  }

  // fetchPage downloads the current page for given index, if the page does not
  // exist yet it will return the default page.
  private async fetchPage<T>(kind: EntryType, index: IIndex): Promise<IPage<T>> {
    const indexPath = kind === EntryType.NEWCONTENT
      ? NC_INDEX_PATH
      : CI_INDEX_PATH;

    const pagePath = kind === EntryType.NEWCONTENT
      ? NC_PAGE_PATH
      : CI_PAGE_PATH;
    
    const currPageStr = String(index.currPageNumber)
    const currPagePath = pagePath.replace(PAGE_REF, currPageStr);

    let page = await this.downloadFile<IPage<T>>(currPagePath);
    if (!page) {
      page = {
        version: INDEX_VERSION,
        indexPath,
        pagePath: currPagePath,
        entries: [],
      }
    }
    return page
  }

  // downloadFile merely wraps getJSON but is typed in a way that avoids
  // repeating the awkward "as unknown as T" everywhere
  private async downloadFile<T>(path: string): Promise<T | null> {
    const json = await this.mySky.getJSON(path)
    if (!json) {
      return null;
    }
    return json as unknown as T
  }

  // updateFile merely wraps setJSON but is typed in a way that avoids repeating
  // the awkwars "as unknown as JsonData" everywhere
  private async updateFile<T>(path: string, data: T) {
    await this.mySky.setJSON(path, data as unknown as JsonData)
  }

  // toPersistence turns content info into a content persistence object
  private toPersistence(data: IContentInfo): IContentPersistence {
    const persistence = {
      ...data,
      timestamp: Math.floor(Date.now() / 1000),
    }
    
    // validate the given data does not exceed max size
    const size = Buffer.from(JSON.stringify(persistence)).length
    if (size > ENTRY_MAX_SIZE) {
      throw new Error(`Entry exceeds max size, ${length}>${ENTRY_MAX_SIZE}`)
    }

    return persistence;
  }
}