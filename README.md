# Demos de integración externa (fuera de `virtualfact_chats`)

Esta carpeta contiene **dos proyectos externos distintos** que se conectan a `virtualfact_chats` — ese repositorio es solo el puente (`api-core`, `websocket-hub`, etc.), no contiene código de ninguno de los dos:

```
portal-cliente-demo/
├── docker-compose.yml    <- levanta los tres servicios de abajo juntos
├── cliente/               <- Proyecto 1: el portal donde el cliente escribe (chat)
│                              ver cliente/README.md
└── empresas/              <- Proyecto 2: sistema de la empresa, dos partes
    ├── facturacion/        <- backend que manda/lee facturas (EMPRESAS_API_KEY)
    │                            ver empresas/facturacion/README.md
    └── crm-agentes/         <- módulo Bootstrap del personal de soporte,
                                 sin backend propio (login directo de agente)
```

Cada carpeta es autocontenida (su propio `Dockerfile`, `package.json`/o estático, su propio `.env`) — comparten este `docker-compose.yml` solo por comodidad de levantar todo junto, no porque sean el mismo sistema.

## Cómo correrlo todo

Primero, siempre, tiene que estar levantado el stack de `virtualfact_chats` (`docker compose up -d` desde esa carpeta) — estos demos dependen de su red.

```
cd portal-cliente-demo
cp cliente/.env.example cliente/.env                             # completar PORTAL_API_KEY
cp empresas/facturacion/.env.example empresas/facturacion/.env   # completar EMPRESAS_API_KEY
docker compose up -d --build
```

- Portal cliente: `http://localhost:4000`
- Sistema de facturación: `http://localhost:4001`
- Módulo del personal (empresas): `http://localhost:8090`

Ver el README de cada subcarpeta para el paso a paso de cómo está implementado.
