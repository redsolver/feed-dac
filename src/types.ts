
export interface IContentInfo {
  content: string;    // skylink
  metadata: object;   // should be valid JSON
}

export interface IContentPersistence {
  timestamp: number;  // unix timestamp of recording
}

export interface INewContentPersistence extends IContentPersistence { }
export interface IInteractionPersistence extends IContentPersistence { }

export interface IIndex {
  version: number;

  currPageNumber: number;
  currPageNumEntries: number;

  pages: string[];
  pageSize: number;
}

export interface IPage<IEntry> {
  version: number;

  indexPath: string; // back reference to the index
  pagePath: string; // back reference to the path

  entries: IEntry[];
}

export interface IResult {
  success: boolean;
  error?: string;
}

export enum EntryType {
  'NEWCONTENT',
  'INTERACTIONS'
}