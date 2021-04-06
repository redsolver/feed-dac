import { SkynetClient } from "skynet-js";
import { ChildHandshake, WindowMessenger } from "post-me";
import ContentRecordDAC from "./dac";

(async () => {
  // create client
  const client = new SkynetClient("https://siasky.net");

  // create connection
  const connection = await ChildHandshake(new WindowMessenger({
    localWindow: window,
    remoteWindow: window.parent,
    remoteOrigin: "*",
  }));

  // create content record
  const cr = new ContentRecordDAC(
    client,
    connection
  );

  // init DAC
  await cr.init();
})();