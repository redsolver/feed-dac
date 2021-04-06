# Content Record DAC

## NOTE (TMP - TODO remove)

Currently needs:

```
npm link skynet-mysky-utils
npm link skynet-js // dac branch
```

## Introduction

The content record DAC allows recording users's interactions with pieces of
content. The main purpose of this DAC is content discovery; if all skapps were
to make use of this library, the end result would be a scrapable global record
of all content and the popularity of that content.

## API

There are two main actions that should leave an entry in the content record:

- when a user `creates` content
- when a user `interacts` with a piece of content

The content record will expose an API to the skapp developer, allowing him to
record these actions. The API is very simple as everything is abstracted from
the skapp developer.

```typescript
export interface IContentInfo {
  skylink: string;
  metadata: object; // should be valid JSON (capped in size ~=4kib)
}

export interface IResult {
  success: boolean;
  error?: string;
}

interface IContentRecordAPI {
  public recordNewContent(content: IContentInfo): Promise<IResult>;
  public recordInteraction(content: IContentInfo): Promise<IResult>;
}
```

## Architecture

TODO
