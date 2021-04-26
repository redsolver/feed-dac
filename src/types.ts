import { Post, PostContent } from "./skystandards";

export interface IFeedDACResponse {
  ref?: string;
  success: boolean;
  error?: string;
}
export interface IFeedDAC {
  createPost(content: PostContent, mentions: string[]): Promise<IFeedDACResponse>;

  createComment(content: PostContent, commentTo: string, parent: Post, mentions: string[]): Promise<IFeedDACResponse>;

  createRepost(repostOf: string, parent: Post, mentions: string[]): Promise<IFeedDACResponse>;
}

/* export interface IContentInfo {
  skylink: string;    // skylink
  metadata: object;   // should be valid JSON
}

export interface IContentPersistence {
  timestamp: number;  // unix timestamp of recording
} */

/* export interface INewContentPersistence extends IContentPersistence { }
export interface IInteractionPersistence extends IContentPersistence { } */

export interface IIndex {
  version: number;

  currPageNumber: number;
  currPageNumEntries: number;

  latestItemTimestamp?: number;
  // pages: string[];
  pageSize: number;
}

export interface IPage {
  $schema: string;

  _self: string; // back reference to the path
  indexPath: string; // back reference to the index

  items: Post[];
}

export interface IDictionary {
  [key: string]: boolean;
}

export enum EntryType {
  "POST",
  "COMMENT",
}

// NOTE: the values contained by this interface are 'static', meaning they won't
// change after the DAC has initialized. That is why they are uppercased,
// because desctructured they will look like regular constants.
//
// e.g. const { NC_INDEX_PATH } = this.paths;
export interface IFilePaths {
  SKAPPS_DICT_PATH: string;

  POSTS_INDEX_PATH: string;
  POSTS_PAGE_PATH: string;

  COMMENTS_INDEX_PATH: string;
  COMMENTS_PAGE_PATH: string;
}
