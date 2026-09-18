function prettyAccountName(name) {
  if (!name) return '';
  return String(name)
    .replace(/(_|-)?(logo|menu_item)(_)?(url)?$/i, '')
    .replace(/[_-]/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

module.exports = { prettyAccountName };
