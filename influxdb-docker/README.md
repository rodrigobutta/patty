## ⚡️ Influx + Grafana + Telegraf

config

```bash
├── .env
└── ...
```

````

Start

```bash
docker-compose up -d
````

Run Influx + Grafana + Telegraf

Start daemon

```bash
> docker-compose up -d
```

Status

```bash
> docker-compose ps
```

See Telegraf logs

```bash
docker container logs -f influxdb-docker_telegraf_1
```

￼
Restart telegraf container after telegraf.conf

```bash
docker-compose restart telegraf
```
