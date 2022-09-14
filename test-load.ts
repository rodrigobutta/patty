import { InfluxDB, Point } from '@influxdata/influxdb-client';

import {
	INFLUX_URL,
	INFLUX_TOKEN,
	INFLUX_ORG,
	INFLUX_BUCKET,
} from './settings';

export const testLoad = async () => {
	const influxDB = new InfluxDB({
		url: INFLUX_URL,
		token: INFLUX_TOKEN,
	});

	const writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET);
	writeApi.useDefaultTags({ region: 'west' });

	const point1 = new Point('temperature')
		.tag('sensor_id', 'TLM01')
		.floatField('value', 25.0);
	console.log(` ${point1}`);

	writeApi.writePoint(point1);

	writeApi
		.close()
		.then(() => {
			console.log('WRITE FINISHED');
		})
		.catch((e: any) => {
			console.error(e);
			console.log('Finished ERROR');
		});
};
