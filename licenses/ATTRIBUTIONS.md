# Créditos y licencias de terceros

Los recursos originales de este proyecto y los recursos de terceros se distinguen a continuación. Las licencias de terceros deben conservarse al redistribuirlos.

## Motor

- **Fairy-Stockfish 14**, Fabian Fichter y colaboradores, derivado de Stockfish.
- Proyecto: https://github.com/fairy-stockfish/Fairy-Stockfish
- Versión exacta y binario: https://github.com/fairy-stockfish/Fairy-Stockfish/releases/tag/fairy_sf_14
- Licencia: GPL-3.0; copia en `FAIRY-STOCKFISH-GPL-3.txt`.
- Código fuente correspondiente incluido en `fairy-stockfish-14-source.tar.gz`, obtenido del tag `fairy_sf_14` (incluye Makefile e instrucciones de compilación).
- El binario no se ha modificado. La definición externa Come-come está en `engine/variants.ini`. Usa `antichess` con `stalemateValue = draw` y promociones `nbrqk`.

## Piezas

Los SVG se obtuvieron de https://github.com/lichess-org/lila/tree/master/public/piece

- **Mérida**: Armando Hernandez Marroquin. GPL-2.0 o posterior.
- **Cburnett**, mostrado como «Clásicas»: Colin M. L. Burnett. GPL-2.0 o posterior.
- **Chessnut**, mostrado como «Modernas»: Alexis Luengas. Apache-2.0. Proyecto: https://github.com/LexLuengas/chessnut-pieces

Se incluyen `PIECES-GPL-2.txt`, `CHESSNUT-LICENSE.txt` y `CHESSNUT-COPYRIGHT.txt`. Los SVG originales se conservan como archivos editables y son su formato fuente. `LICHESS-COPYING.md` es el inventario de atribuciones del repositorio de origen; no significa que todos los recursos allí enumerados se incluyan en NEXO.

No se incluye la familia Alpha, cuya licencia original limita el uso comercial.

## Tipografía

- **DM Sans**, Colophon Foundry y autores indicados en `DM-Sans-OFL.txt`.
- **Manrope**, autores indicados en `Manrope-OFL.txt`.
- SIL Open Font License 1.1. Archivos descargados de Google Fonts, alojados localmente sin modificar.

## Dependencias de código

Las versiones exactas están fijadas en `package-lock.json`. Las distribuciones instaladas incluyen sus licencias respectivas.

- React / React DOM: MIT.
- Vite: MIT.
- Express: MIT.
- chess.js: BSD-2-Clause.
- Lucide: ISC, con avisos de los iconos derivados conservados por el paquete.
- Playwright: Apache-2.0, solo para pruebas.

## Retratos

NYX, KAIRO y VEGA: imágenes generadas por IA para NEXO, no fotografías de personas reales ni recursos de Lichess.
