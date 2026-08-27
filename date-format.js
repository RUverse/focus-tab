import moment from "moment";

// Kept behind this small adapter so Moment.js is bundled once and application
// code never depends on a global or remote script.
export function formatDate(date, format) {
  return moment(date).format(format);
}
