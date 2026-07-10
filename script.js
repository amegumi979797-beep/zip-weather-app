const ZIPCLOUD_ENDPOINT = "https://zipcloud.ibsnet.co.jp/api/search";
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

// WMO weather code -> [絵文字, 説明]
const WEATHER_CODE_MAP = {
  0: ["☀️", "快晴"],
  1: ["🌤️", "晴れ"],
  2: ["⛅", "一部曇り"],
  3: ["☁️", "曇り"],
  45: ["🌫️", "霧"],
  48: ["🌫️", "霧氷"],
  51: ["🌦️", "小雨（弱い霧雨）"],
  53: ["🌦️", "霧雨"],
  55: ["🌧️", "強い霧雨"],
  56: ["🌧️", "着氷性の霧雨"],
  57: ["🌧️", "強い着氷性の霧雨"],
  61: ["🌦️", "小雨"],
  63: ["🌧️", "雨"],
  65: ["🌧️", "強い雨"],
  66: ["🌧️", "着氷性の雨"],
  67: ["🌧️", "強い着氷性の雨"],
  71: ["🌨️", "小雪"],
  73: ["🌨️", "雪"],
  75: ["❄️", "大雪"],
  77: ["❄️", "霧雪"],
  80: ["🌦️", "にわか雨"],
  81: ["🌧️", "強いにわか雨"],
  82: ["⛈️", "激しいにわか雨"],
  85: ["🌨️", "にわか雪"],
  86: ["❄️", "強いにわか雪"],
  95: ["⛈️", "雷雨"],
  96: ["⛈️", "雷雨（ひょうを伴う）"],
  99: ["⛈️", "激しい雷雨（ひょうを伴う）"],
};

function weatherInfo(code) {
  return WEATHER_CODE_MAP[code] || ["❓", "不明"];
}

const form = document.getElementById("search-form");
const input = document.getElementById("zipcode-input");
const button = document.getElementById("search-button");
const messageEl = document.getElementById("message");
const loadingEl = document.getElementById("loading");
const resultEl = document.getElementById("result");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const zipcode = normalizeZipcode(input.value);

  hideMessage();
  resultEl.hidden = true;

  if (!/^\d{7}$/.test(zipcode)) {
    showMessage("郵便番号は7桁の数字で入力してください（例: 100-0001）");
    return;
  }

  setLoading(true);
  try {
    const address = await fetchAddress(zipcode);
    const location = await geocodeAddress(address);
    const weather = await fetchWeather(location.latitude, location.longitude);
    renderResult(zipcode, address, weather);
  } catch (err) {
    showMessage(err.message || "検索中にエラーが発生しました");
  } finally {
    setLoading(false);
  }
});

function normalizeZipcode(value) {
  return value.replace(/[^0-9]/g, "");
}

function setLoading(isLoading) {
  loadingEl.hidden = !isLoading;
  button.disabled = isLoading;
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = false;
}

function hideMessage() {
  messageEl.hidden = true;
}

async function fetchAddress(zipcode) {
  const res = await fetch(`${ZIPCLOUD_ENDPOINT}?zipcode=${zipcode}`);
  if (!res.ok) {
    throw new Error("住所情報の取得に失敗しました（ZipCloud API）");
  }
  const data = await res.json();
  if (data.message) {
    throw new Error(data.message);
  }
  if (!data.results || data.results.length === 0) {
    throw new Error("該当する住所が見つかりませんでした");
  }
  const r = data.results[0];
  return {
    prefecture: r.address1,
    city: r.address2,
    town: r.address3,
    full: `${r.address1}${r.address2}${r.address3}`,
  };
}

async function geocodeAddress(address) {
  const candidates = [
    `${address.prefecture}${address.city}`,
    address.city,
    address.prefecture,
  ];

  for (const name of candidates) {
    const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(
      name
    )}&count=1&language=ja&format=json`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return { latitude: r.latitude, longitude: r.longitude };
    }
  }

  throw new Error("この住所の位置情報が見つかりませんでした");
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current_weather: "true",
    daily: "weathercode,temperature_2m_max,temperature_2m_min",
    hourly: "relative_humidity_2m",
    timezone: "Asia/Tokyo",
    forecast_days: "5",
  });
  const res = await fetch(`${FORECAST_ENDPOINT}?${params.toString()}`);
  if (!res.ok) {
    throw new Error("天気情報の取得に失敗しました（Open-Meteo API）");
  }
  return res.json();
}

function findCurrentHumidity(weather) {
  if (!weather.hourly || !weather.hourly.time) return null;
  // current_weather.time has minute precision (e.g. "...T10:45");
  // hourly data only has hour precision, so truncate to the hour first.
  const targetTime = weather.current_weather.time.replace(/:\d{2}$/, ":00");
  const idx = weather.hourly.time.indexOf(targetTime);
  if (idx === -1) return null;
  return weather.hourly.relative_humidity_2m[idx];
}

function renderResult(zipcode, address, weather) {
  document.getElementById(
    "address-text"
  ).textContent = `${address.prefecture}${address.city}${address.town}`;
  document.getElementById(
    "zipcode-text"
  ).textContent = `〒${zipcode.slice(0, 3)}-${zipcode.slice(3)}`;

  const cw = weather.current_weather;
  const [icon, desc] = weatherInfo(cw.weathercode);
  document.getElementById("current-icon").textContent = icon;
  document.getElementById("current-temp").textContent = `${Math.round(
    cw.temperature
  )}°C`;
  document.getElementById("current-desc").textContent = desc;
  document.getElementById(
    "current-wind"
  ).textContent = `🌬️ 風速 ${cw.windspeed} km/h`;

  const humidity = findCurrentHumidity(weather);
  document.getElementById("current-humidity").textContent =
    humidity !== null ? `💧 湿度 ${humidity}%` : "";

  const forecastList = document.getElementById("forecast-list");
  forecastList.innerHTML = "";
  const daily = weather.daily;
  const dayLabels = ["今日", "明日", "明後日"];
  for (let i = 0; i < daily.time.length; i++) {
    const date = new Date(daily.time[i]);
    const label =
      dayLabels[i] || `${date.getMonth() + 1}/${date.getDate()}`;
    const [dIcon] = weatherInfo(daily.weathercode[i]);
    const item = document.createElement("div");
    item.className = "forecast-item";
    item.innerHTML = `
      <div class="day">${label}</div>
      <div class="icon">${dIcon}</div>
      <div class="temps">
        <span class="max">${Math.round(daily.temperature_2m_max[i])}°</span>
        / <span class="min">${Math.round(daily.temperature_2m_min[i])}°</span>
      </div>
    `;
    forecastList.appendChild(item);
  }

  resultEl.hidden = false;
}
