# Content Record

## Content Record Library 

### Description

The content record library is a DAC for skapp developers that allows recording
users's interactions with pieces of content. The main purpose of this tool is
content discovery; if all skapps were to make use of this library, the end
result would be a scrapable global record of all content and the popularity of
that content.

### API

There are two main actions that should leave an entry in the content record:
- when a user `creates` content
- when a user `interacts` with a piece of content

The content record will expose an API to the skapp developer, allowing him to
record these actions. The API is very simple as everything is abstracted from
the skapp developer.

```typescript
export interface IContentInfo {
  skylink: string;
  metadata: object;   // should be valid JSON (capped in size ~=4kib)
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

## Usage

In this section we'll show an example of how a skapp could use the content
record DAC. It shows how it would be loaded and interacted with from the context
of a skapp.

```typescript
    import { SkynetClient } from 'skynet-js';
    import { ContentRecordDAC } from 'skynet-cr-record';

    const DATA_DOMAIN = "mynewskapp.hns"
    
    class MyNewSkapp {
        private contentRecord: IContentDAC; //

        function init() {
            // create client
            const client = new SkynetClient();
            
            // load mysky
            const mySky = await client.loadMySky(DATA_DOMAIN);
            
            // create content record DAC
            this.contentRecord = new ContentRecordDAC()
            
            // load DAC
            mySky.loadDac(this.contentRecord);
            
            // after all DACs are loaded, proceed to log in
            // this is to ensure we have all required permissions
            try {
                const loggedIn = mySky.checkLogin();
                if (!loggedIn) {
                    document
                        .getObjectByID("login-button")
                        .addEventListener("click", mySky.requestLoginAccess());
                }
            } catch(error) {
                console.log('error:', error)
                process.exit(1)
            }
        }
        
        // example create function
        function createContent(skylink: string) {
            const result = await this.contentRecord.recordNewContent({
                skylink,
                metadata: {"foo": "bar"}
            });
            // possibly check result 
        }
        
        // example interact function
        function likeContent(skylink: string) {
            const result = await this.contentRecord.recordInteraction({
                skylink,
                metadata: {"action": "liked"}
            });
            // possibly check result
        }
    }
    
```
