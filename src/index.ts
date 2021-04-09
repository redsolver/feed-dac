import ContentRecordDAC from "./dac";
import { SkynetClient } from "skynet-js";

(async () => {
  // create client
  const client = new SkynetClient("https://siasky.net");

  // create DAC
  new ContentRecordDAC(client);
})();
