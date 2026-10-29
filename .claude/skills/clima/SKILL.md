---
name: clima
description: Consulta la temperatura y las condiciones del clima actuales (y opcionalmente el pronóstico) usando la API gratuita de Open-Meteo. Por defecto usa Ñuñoa, Región Metropolitana, Santiago de Chile. Úsala cuando el usuario pregunte por el clima, la temperatura, si llueve, el viento o el pronóstico de una ciudad o comuna.
argument-hint: "[ciudad o comuna] [pronostico]"
---

# Clima actual con Open-Meteo

Obtén el clima con `curl` contra Open-Meteo (no requiere API key) y responde **en español**, en forma breve.

## 1. Determinar la ubicación

- **Sin argumentos** → usar Ñuñoa: `latitude=-33.4569`, `longitude=-70.5976`.
- **Con una ciudad/comuna** en `$ARGUMENTS` → geocodificar primero:

```bash
curl -s "https://geocoding-api.open-meteo.com/v1/search?name=<NOMBRE_URL_ENCODED>&count=5&language=es&format=json"
```

Elige el resultado que mejor coincida (prioriza `country_code: "CL"` si el usuario no indica país). Si no hay resultados, díselo al usuario y pide otro nombre. Si hay varias coincidencias ambiguas en países distintos, menciona cuál elegiste.

## 2. Consultar el clima actual

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto"
```

Si el usuario pide **pronóstico** (o `$ARGUMENTS` contiene "pronostico"/"pronóstico"/"mañana"/"semana"), agrega:

```
&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3
```

## 3. Traducir `weather_code` (WMO)

| Código | Condición | Emoji |
|---|---|---|
| 0 | Despejado | ☀️ |
| 1, 2 | Mayormente despejado / parcialmente nublado | 🌤️ |
| 3 | Nublado | ☁️ |
| 45, 48 | Niebla | 🌫️ |
| 51, 53, 55 | Llovizna (ligera / moderada / intensa) | 🌦️ |
| 56, 57 | Llovizna helada | 🌧️ |
| 61, 63, 65 | Lluvia (ligera / moderada / intensa) | 🌧️ |
| 66, 67 | Lluvia helada | 🌧️ |
| 71, 73, 75, 77 | Nieve | 🌨️ |
| 80, 81, 82 | Chubascos | 🌦️ |
| 85, 86 | Chubascos de nieve | 🌨️ |
| 95, 96, 99 | Tormenta eléctrica | ⛈️ |

## 4. Formato de respuesta

Clima actual, una sola línea:

```
🌦️ Ñuñoa, 13:00: **15,3 °C** con llovizna ligera; sensación 15,3 °C, humedad 54 %, viento 5 km/h.
```

- Usa coma decimal y la hora local de `current.time`.
- Con pronóstico, agrega una línea por día: `Sáb 25: 🌤️ 9–22 °C, 10 % lluvia`.

## Notas

- Open-Meteo actualiza los datos actuales cada 15 minutos (`current.interval: 900`); consultas más frecuentes devuelven el mismo valor.
- Si `curl` falla o la API responde con `"error": true`, informa el mensaje (`reason`) en vez de inventar datos.
