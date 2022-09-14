"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testQuery = void 0;
const { InfluxDB } = require('@influxdata/influxdb-client');
const settings_1 = require("./settings");
const testQuery = () => {
    const client = new InfluxDB({ url: settings_1.INFLUX_URL, token: settings_1.INFLUX_TOKEN });
    const queryApi = client.getQueryApi(settings_1.INFLUX_ORG);
    const query = `from(bucket: "${settings_1.INFLUX_BUCKET}") |> range(start: -2h)`;
    queryApi.queryRows(query, {
        next(row, tableMeta) {
            const o = tableMeta.toObject(row);
            console.log(`TIME: ${o._time} MESAUREMENT: ${o._measurement} >>> FIELD ${o._field}=${o._value}`);
        },
        error(error) {
            console.error(error);
            console.log('Finished ERROR');
        },
        complete() {
            console.log('Finished SUCCESS');
        },
    });
};
exports.testQuery = testQuery;
