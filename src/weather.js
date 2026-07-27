const WMO_GROUPS = [
  { codes: [0], label: "晴朗", icon: "☀️" },
  { codes: [1], label: "大致晴朗", icon: "🌤️" },
  { codes: [2], label: "局部多云", icon: "⛅" },
  { codes: [3], label: "阴天", icon: "☁️" },
  { codes: [45, 48], label: "有雾", icon: "🌫️" },
  { codes: [51, 53, 55, 56, 57], label: "毛毛雨", icon: "🌦️" },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "有雨", icon: "🌧️" },
  { codes: [71, 73, 75, 77, 85, 86], label: "有雪", icon: "🌨️" },
  { codes: [95, 96, 99], label: "雷雨", icon: "⛈️" },
];

function weatherCodeInfo(code, isDay = 1) {
  const found = WMO_GROUPS.find((group) => group.codes.includes(Number(code)));
  if (!found) return { label: "天气未知", icon: "🌡️" };
  if (Number(code) === 0 && !Number(isDay)) return { label: "晴朗", icon: "🌙" };
  return { label: found.label, icon: found.icon };
}

function normalizeLocation(result) {
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
    throw new Error("没有找到有效城市");
  }
  return {
    id: result.id || null,
    name: result.name || "未知城市",
    admin1: result.admin1 || "",
    country: result.country || "",
    countryCode: result.country_code || "",
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: result.timezone || "auto",
  };
}

function parseForecast(payload, location) {
  if (!payload?.current || !payload?.daily?.time?.length) throw new Error("天气服务返回的数据不完整");
  const currentInfo = weatherCodeInfo(payload.current.weather_code, payload.current.is_day);
  const days = payload.daily.time.slice(0, 4).map((date, index) => {
    const info = weatherCodeInfo(payload.daily.weather_code?.[index], 1);
    return {
      date,
      label: info.label,
      icon: info.icon,
      max: Math.round(payload.daily.temperature_2m_max?.[index]),
      min: Math.round(payload.daily.temperature_2m_min?.[index]),
      rainChance: Math.round(payload.daily.precipitation_probability_max?.[index] || 0),
    };
  });
  return {
    location,
    updatedAt: new Date().toISOString(),
    current: {
      temperature: Math.round(payload.current.temperature_2m),
      apparentTemperature: Math.round(payload.current.apparent_temperature),
      humidity: Math.round(payload.current.relative_humidity_2m),
      windSpeed: Math.round(payload.current.wind_speed_10m),
      weatherCode: payload.current.weather_code,
      label: currentInfo.label,
      icon: currentInfo.icon,
      isDay: Boolean(payload.current.is_day),
    },
    days,
    timezone: payload.timezone || location.timezone,
  };
}

module.exports = { normalizeLocation, parseForecast, weatherCodeInfo };
