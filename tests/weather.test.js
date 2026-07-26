const assert = require("node:assert/strict");
const { normalizeLocation, parseForecast, weatherCodeInfo } = require("../src/weather");

assert.deepEqual(weatherCodeInfo(0, 0), { label: "晴朗", icon: "🌙" });
assert.equal(weatherCodeInfo(63).label, "有雨");
assert.equal(weatherCodeInfo(95).label, "雷雨");

const location = normalizeLocation({
  id: 1,
  name: "北京",
  admin1: "北京市",
  country: "中国",
  country_code: "CN",
  latitude: 39.91,
  longitude: 116.4,
  timezone: "Asia/Shanghai",
});
assert.equal(location.countryCode, "CN");

const forecast = parseForecast({
  timezone: "Asia/Shanghai",
  current: {
    temperature_2m: 29.4,
    apparent_temperature: 31.1,
    relative_humidity_2m: 61,
    wind_speed_10m: 8.7,
    weather_code: 2,
    is_day: 1,
  },
  daily: {
    time: ["2026-07-26", "2026-07-27"],
    weather_code: [2, 61],
    temperature_2m_max: [31.2, 27.8],
    temperature_2m_min: [22.4, 20.3],
    precipitation_probability_max: [20, 80],
  },
}, location);

assert.equal(forecast.current.temperature, 29);
assert.equal(forecast.current.label, "局部多云");
assert.equal(forecast.days[1].rainChance, 80);
assert.equal(forecast.days[1].max, 28);

console.log("weather tests passed");
