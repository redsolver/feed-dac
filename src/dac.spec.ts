
import { SkynetClient } from "skynet-js"
import type { Connection } from "post-me";
import ContentRecordDAC from "./dac"

const clientMock = {
  loadMySky: jest.fn(() => mySkyMock)
} as unknown as SkynetClient

const mySkyMock = {
  getJSON: jest.fn(),
  setJSON: jest.fn()
}

const connectionMock = {
  localHandle: jest.fn(() => {
    return {
      setMethods: jest.fn()
  }})
} as unknown as Connection<any,any,any>

// TODO: extend tests
test('should properly initialze a DAC', async () => {
  const dac = new ContentRecordDAC(clientMock, connectionMock)
  await dac.init()

  const getJSONCalls = mySkyMock.getJSON.mock.calls
  expect(getJSONCalls.length).toBe(1)
  expect(getJSONCalls[0][0]).toBe("contentrecord.hns/skapps.json")
})