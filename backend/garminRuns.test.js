const assert = require("node:assert/strict");
const test = require("node:test");
const { mapActivities, formatPace, formatDuration } = require("./garminRuns");

test("pace and duration format from summary units", () => {
  assert.equal(formatPace(1000 / 300), "5:00");
  assert.equal(formatDuration(3723), "1:02:03");
  assert.equal(formatDuration(90), "1:30");
});

test("maps running summaries newest first and skips other sports", () => {
  const rows = mapActivities([
    {
      activityId: 1,
      activityName: "Older run",
      startTimeLocal: "2026-08-01 07:00:00",
      distance: 5000,
      duration: 1800,
      averageSpeed: 5000 / 1800,
      averageHR: 140.2,
      maxHR: 168,
      averageRunningCadenceInStepsPerMinute: 172.4,
      activityType: { typeKey: "running" },
    },
    {
      activityId: 2,
      activityName: "Ride",
      startTimeLocal: "2026-08-20 07:00:00",
      distance: 20000,
      duration: 3600,
      activityType: { typeKey: "cycling" },
    },
    {
      activityId: 3,
      activityName: "Newer trail",
      startTimeLocal: "2026-08-24 06:15:00",
      distance: 10250,
      duration: 3900,
      activityType: { typeKey: "trail_running" },
    },
  ]);

  assert.deepEqual(rows.map((row) => row.name), ["Newer trail", "Older run"]);
  assert.equal(rows[1].date, "1 Aug 2026");
  assert.equal(rows[1].monthKey, "2026-08");
  assert.equal(rows[1].monthLabel, "August 2026");
  assert.equal(rows[1].weekKey, "2026-07-27");
  assert.equal(rows[1].weekLabel, "27 July – 2 Aug 2026");
  assert.equal(rows[1].distanceKm, "5.00");
  assert.equal(rows[1].duration, "30:00");
  assert.equal(rows[1].pace, "6:00");
  assert.equal(rows[1].averageHeartRate, "140");
  assert.equal(rows[1].maxHeartRate, "168");
  assert.equal(rows[1].averageCadence, "172");
  assert.equal(rows[0].averageHeartRate, null);
});

test("reads the activity list from either a bare array or an activities object", () => {
  const wrapped = mapActivities({
    activities: [{ activityId: 9, activityName: "Loop", startTimeLocal: "2026-01-02 08:00:00", activityType: { typeKey: "running" } }],
  });
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0].name, "Loop");
});
