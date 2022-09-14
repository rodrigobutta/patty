const { InfluxDB } = require('@influxdata/influxdb-client');

import {
	INFLUX_URL,
	INFLUX_TOKEN,
	INFLUX_ORG,
	INFLUX_BUCKET,
} from './settings';

export const testQuery = () => {
	const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });

	const queryApi = client.getQueryApi(INFLUX_ORG);

	const query = `from(bucket: "${INFLUX_BUCKET}") |> range(start: -2h)`;
	queryApi.queryRows(query, {
		next(row: any, tableMeta: { toObject: (arg0: any) => any }) {
			const o = tableMeta.toObject(row);
			console.log(
				`TIME: ${o._time} MESAUREMENT: ${o._measurement} >>> FIELD ${o._field}=${o._value}`
			);
		},
		error(error: any) {
			console.error(error);
			console.log('Finished ERROR');
		},
		complete() {
			console.log('Finished SUCCESS');
		},
	});
};
