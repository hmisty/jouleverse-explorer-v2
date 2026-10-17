// English — the default locale and the single source of i18n keys.
// Other locales are typed as I18nDict = typeof en, so any missing key
// (or extra key) fails the vue-tsc build. Keep this file authoritative.

const en = {
  backToHome: '← Back to Home',
  title: 'JNS Domain Overview',
  subtitle: 'Browse all .j domains on Jouleverse',
  langLabel: 'Language',
  statTotal: 'Total domains',
  statBound: 'Bound',
  statOwners: 'Holders',
  statProgress: 'Loaded',
  partialMark: 'Partial — based on domains loaded so far',
  searchPlaceholder: 'Search domain name, e.g. love',
  filterAll: 'All',
  refresh: 'Refresh',
  loadMore: 'Load more',
  loadAll: 'Load all ({total})',
  loading: 'Loading domains…',
  errorTitle: 'Failed to load domains',
  retry: 'Retry',
  emptyTitle: 'No domains found',
  emptyDesc: 'Try another keyword or letter filter',
  noDomainsTitle: 'No domains yet',
  noDomainsDesc: 'No .j domains have been registered on Jouleverse yet',
  progressHint: '{loaded} of {total} domains loaded',
  boundTag: 'Bound',
  unboundTag: 'Unbound',
  ownerLabel: 'Owner',
  viewDetail: 'View detail',
  navEntry: 'JNS Domain Overview',
  boundUnknownTag: 'Unknown',
  failedHint: '{n} reads failed',
  newestFirst: 'Sorted by registration, newest first',
}

export default en
export type I18nDict = typeof en
