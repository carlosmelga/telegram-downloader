# telegram-downloader

CLI que escucha un chat/canal de Telegram y descarga a disco cualquier fichero que se reenvíe ahí (video, mkv, mp4, zip, lo que sea). Pensado para bulks grandes (100+ ficheros de golpe) con descarga concurrente controlada.

Usa tu cuenta de Telegram directamente (MTProto, vía [gramjs](https://github.com/gram-js/gramjs)) — no un bot — así que no hay límite de 20MB/50MB de la Bot API.

## Setup

```
npm install
npm start
```

La primera vez te pide, en este orden:

1. **API ID / API Hash** — sácalos en https://my.telegram.org → "API development tools".
2. **Teléfono, código, 2FA** (si aplica) — login normal de Telegram.
3. **Canal/chat a escuchar** — te lista tus chats recientes, eliges el número.

Todo eso (credenciales, sesión, canal elegido, carpeta destino, concurrencia) se guarda en `config.json` en la raíz del proyecto. No se vuelve a preguntar en arranques posteriores.

## Uso

`npm start` abre la interfaz (TUI):

```
 telegram-downloader  |  source: mi_canal
 ✓ pelicula.mkv 1.8GB
 ↓ episodio_02.mp4 ████████░░░░░░░░░░░░ 210.0MB/500.2MB
 … episodio_03.mp4 482.9MB
 ...
 q quit  f filter[all]  c clear done  b backfill  del delete done  s settings  h help
```

Simplemente reenvía ficheros al chat/canal configurado — aparecen solos en la lista y se descargan (respetando el límite de concurrencia).

### Teclas

| Tecla | Acción |
|---|---|
| `q` / `Ctrl-C` | salir |
| `↑` `↓` | scroll de la lista |
| `f` | rota el filtro (all → downloading → pending → done → error) |
| `c` | limpia de la lista los ya completados |
| `b` | backfill — escanea historial del chat (pide cuántos mensajes atrás) y descarga lo que falte |
| `Supr` | borra en Telegram los mensajes de los ficheros ya descargados (pide confirmación, irreversible) |
| `s` | settings — cambiar canal, concurrencia o carpeta de descarga, sin reiniciar |
| `h` | ayuda en pantalla |

## Correr en background (sobrevive cerrar la terminal)

La TUI necesita una terminal real. Para dejarlo corriendo tras cerrar la terminal, dos opciones:

**pm2** (recomendado, con auto-restart):

```
npm install -g pm2
pm2 start index.js --name tg-downloader
pm2 logs tg-downloader
pm2 save && pm2 startup   # opcional: que arranque solo al reiniciar la máquina
```

**nohup**:

```
nohup node index.js > tg.log 2>&1 & disown
tail -f tg.log
```

En ambos casos, al no haber terminal (TTY), la app cae sola en modo headless: log de líneas simples (`[queued]`, `[downloading]`, `[done]`, `[error]`) en vez de la TUI. `config.json` ya tiene que existir (corré `npm start` en modo interactivo al menos una vez antes para hacer el setup inicial).

En modo headless no hay teclas — solo descarga lo que vaya llegando al chat configurado.

## Estructura

```
index.js          entry point
lib/
  setup.js        wizard primer arranque (credenciales, login, elegir canal)
  config.js       leer/guardar config.json
  client.js       cliente de Telegram (gramjs)
  download.js     detecta y descarga ficheros de un mensaje
  backfill.js     escanea historial y descarga lo pendiente
  limiter.js      límite de concurrencia (reconfigurable en caliente)
  queue.js        estado de la cola (pending/downloading/done/error)
  ui.js           interfaz de terminal (blessed)
  headless.js     logging simple para cuando no hay terminal (pm2/nohup)
config.json       generado automático, no se versiona
```

## Notas

- `config.json` guarda la sesión de tu cuenta de Telegram — no lo compartas ni lo subas a git (ya está en `.gitignore`).
- Si la sesión deja de ser válida, borrá `config.json` y volvé a correr `npm start` para loguearte de nuevo.
- `Supr` borra los mensajes originales del chat, no los ficheros ya bajados a disco.
