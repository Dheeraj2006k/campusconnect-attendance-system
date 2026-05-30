const DEFAULT_ATTENDANCE_THRESHOLD = Number(process.env.LOW_ATTENDANCE_THRESHOLD || 75);

function normalizeThreshold(value) {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 100) {
    return DEFAULT_ATTENDANCE_THRESHOLD;
  }

  return threshold;
}

function calculateAttendancePrediction({ present = 0, total = 0, threshold }) {
  const safeThreshold = normalizeThreshold(threshold);
  const presentCount = Number(present || 0);
  const totalClasses = Number(total || 0);
  const percentage = totalClasses > 0
    ? Number(((presentCount * 100) / totalClasses).toFixed(2))
    : null;
  const lowAttendance = percentage !== null && percentage < safeThreshold;

  let classesNeededToReachThreshold = 0;
  let classesCanMissSafely = 0;

  if (totalClasses > 0 && lowAttendance) {
    classesNeededToReachThreshold = Math.max(
      0,
      Math.ceil(((safeThreshold * totalClasses) - (100 * presentCount)) / (100 - safeThreshold))
    );
  }

  if (totalClasses > 0 && !lowAttendance) {
    classesCanMissSafely = Math.max(
      0,
      Math.floor(((100 * presentCount) - (safeThreshold * totalClasses)) / safeThreshold)
    );
  }

  return {
    threshold: safeThreshold,
    percentage,
    low_attendance: lowAttendance,
    classes_needed_to_reach_threshold: classesNeededToReachThreshold,
    classes_can_miss_safely: classesCanMissSafely,
    prediction_message: lowAttendance
      ? `Attend ${classesNeededToReachThreshold} upcoming class${classesNeededToReachThreshold === 1 ? '' : 'es'} to reach ${safeThreshold}%.`
      : `You can miss ${classesCanMissSafely} upcoming class${classesCanMissSafely === 1 ? '' : 'es'} and stay at or above ${safeThreshold}%.`,
  };
}

module.exports = {
  DEFAULT_ATTENDANCE_THRESHOLD,
  calculateAttendancePrediction,
  normalizeThreshold,
};
