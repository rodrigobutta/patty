"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testLoad = void 0;
const influxdb_client_1 = require("@influxdata/influxdb-client");
const settings_1 = require("./settings");
const testLoad = () => __awaiter(void 0, void 0, void 0, function* () {
    const influxDB = new influxdb_client_1.InfluxDB({
        url: settings_1.INFLUX_URL,
        token: settings_1.INFLUX_TOKEN,
    });
    const writeApi = influxDB.getWriteApi(settings_1.INFLUX_ORG, settings_1.INFLUX_BUCKET);
    writeApi.useDefaultTags({ region: 'west' });
    const point1 = new influxdb_client_1.Point('temperature')
        .tag('sensor_id', 'TLM01')
        .floatField('value', 25.0);
    console.log(` ${point1}`);
    writeApi.writePoint(point1);
    writeApi
        .close()
        .then(() => {
        console.log('WRITE FINISHED');
    })
        .catch((e) => {
        console.error(e);
        console.log('Finished ERROR');
    });
});
exports.testLoad = testLoad;
