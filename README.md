# BBR-bygninger på kort

En statisk webside, der viser BBR-bygninger som punkter på et Leaflet-kort. Data
hentes fra FlatGeobuf-filens rumlige indeks, så browseren kun læser punkter i det
aktuelle kortudsnit. Siden indeholder adresseopslag, byggeårstidslinje,
luftfoto, skråfoto og videoeksport.

## Udvikling og AI

Websiden er primært udviklet med hjælp fra GitHub Copilot, en AI-kodeassistent.
Copilot har bidraget til at skrive og ændre kode ud fra projektets krav.

## Data

Hent GeoPackage-datafilen fra
[Dataforsyningen – BBR INSPIRE](https://dataforsyningen.dk/data/3829), og læg den
i `www/local/`. Konvertér den til FlatGeobuf, som egner sig til rumlige opslag
fra browseren:

GeoPackage-filen fylder cirka 5 GB, og den konverterede FlatGeobuf-fil fylder
tilsvarende cirka 5 GB. Sørg derfor for at have plads til begge filer under
konverteringen. GeoPackage-filen skal ikke bruges efter konverteringen og kan
slettes lokalt, når du har kontrolleret, at `bbr.fgb` er oprettet korrekt.

```sh
cd www/local
ogr2ogr -skipfailures bbr.fgb DK_INSPIRE_BBR.gpkg
```

Den færdige fil skal derfor ligge på `www/local/bbr.fgb`. Mappen `www/local/`
ignorerer alle datafiler i Git; store eller licensbelagte datakopier skal ikke
committeres.

## Konfiguration

Opret den lokale konfigurationsfil ud fra eksemplet:

```sh
cp www/config.example.js www/config.js
```

Udfyld de tre tomme adgangsfelter i `www/config.js` med dine egne
tjenestetokens/nøgler:

| Felt | Værdi |
| --- | --- |
| `ADRESSEVAELGER_TOKEN` | Token til Adressevælgerens adresseopslag. |
| `DATAFORDELER_APIKEY` | API-nøgle til Datafordelerens GraphQL-opslag. |
| `DATAFORSYNINGEN_TOKEN` | Token til Dataforsyningens luftfotolag. |

Tjenesternes URL-felter er allerede udfyldt i eksempelfilen og behøver normalt
ikke ændres. `BBR_DATA_URL` skal pege på FlatGeobuf-filen relativt til `www/`;
standardværdien `local/bbr.fgb` passer til dataopsætningen ovenfor. De øvrige
værdier styrer kortets startposition og zoom, minimum zoom, animationshastighed,
punktmængden pr. animationstrin, videoens billedfrekvens og Mediabunny-CDN'en.

`www/config.js` er ignoreret af Git. Læg ikke tokens i `config.example.js` eller
andre filer, der skal deles.

## Kør lokalt

Servér `www/` over HTTP, eksempelvis:

```sh
cd www
python3 -m http.server 8000
```

Åbn derefter <http://localhost:8000/>. HTTP-serveren skal understøtte
Range-requests, så FlatGeobufs rumlige indeks kan læses uden at hente hele
datafilen.

Siden bruger Leaflet, FlatGeobuf JavaScript og Mediabunny fra CDN. Der kræves
ikke Node.js eller npm for at køre websiden. Videoeksport indlæser Mediabunny
fra CDN ved behov og bruger browserens WebCodecs-understøttelse.
