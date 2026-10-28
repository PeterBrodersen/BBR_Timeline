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

Knap 10 % af punkterne har det kunstige byggeår `1000`. Det behandles som et
ugyldigt årstal og er filtreret fra som standard. På kortet kan punkterne vises
med afkrydsningsfeltet "Vis ugyldige årstal".

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
| `DATAFORSYNINGEN_TOKEN` | Token til vektorkortet, luftfotolaget og skråfoto-forhåndsvisningen i bygningspopup. |

Tjenesternes URL-felter er allerede udfyldt i eksempelfilen og behøver normalt
ikke ændres. `BBR_DATA_URL` skal pege på FlatGeobuf-filen relativt til `www/`;
standardværdien `local/bbr.fgb` passer til dataopsætningen ovenfor. De øvrige
værdier styrer kortets startposition og zoom, minimum zoom, animationshastighed,
punktmængden pr. animationstrin, histogrammets y-akses skalering, videoens
billedfrekvens og CDN-adresserne til de eksterne biblioteker. `YEAR_HISTOGRAM_SCALE`
er som standard `linear`; den kan også sættes til `logarithmic`.

Baggrundslagene vises i rækkefølgen Skærmkort (vektortiles), Luftfoto og
OpenStreetMap. Skærmkortet bruger Dataforsyningens officielle vektorstyle
[3857_skaermkort_klassisk](https://cdn.dataforsyningen.dk/assets/vector_tiles_assets/latest/styles/official/3857_skaermkort_klassisk.json)
i EPSG:3857. Vektorkortet kan zoomes til niveau 20, OpenStreetMap til 19 og
luftfoto til 21.

Skråfoto-forhåndsvisningen henter et lille udsnit direkte fra en Cloud Optimized
GeoTIFF-fil, når en bygningspopup åbnes. Den starter med nord, hvis billedet
findes, og pilene skifter mellem de tilgængelige retninger. Udsnittets position
beregnes ud fra fotokameraets metadata med en anslået terrænhøjde på 20 meter;
det kan derfor afvige fra bygningens præcise placering i billedet.
Da skråfoto-CDN'en ikke tillader token-headeren fra browseren, sendes tokenet i
billed-URL'en. En offentlig statisk side kan derfor ikke holde tokenet hemmeligt.

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

Siden bruger Leaflet, FlatGeobuf JavaScript, MapLibre GL JS, MapLibre-Leaflet,
GeoTIFF og Mediabunny fra CDN. Biblioteksadresserne samles i `config.js`.
Der kræves ikke Node.js eller npm for at køre websiden. Videoeksport indlæser
Mediabunny fra CDN ved behov og bruger browserens WebCodecs-understøttelse.
