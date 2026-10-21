import { View } from 'react-native';
import { Banner } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { t } from '@/i18n/pt-BR';
import { env } from '@/lib/env';

/** Stale patch, test data, partial data, no backend: always visible when they apply. */
export function DataBanners() {
  const { staleBanner, release, status, syncError } = useCatalog();
  const banners = [];
  if (!env.hasBackend && !env.manifestUrl)
    banners.push(<Banner key="nb" tone="warning" text={t.common.noBackend} />);
  if (staleBanner)
    banners.push(<Banner key="stale" tone="warning" text={staleBanner} testID="stale-banner" />);
  if (release?.catalog.fixture)
    banners.push(<Banner key="fx" tone="danger" text={t.common.fixtureBanner} />);
  if (release?.catalog.partial)
    banners.push(<Banner key="partial" tone="warning" text={t.common.partialBanner} />);
  if (status === 'empty')
    banners.push(<Banner key="empty" tone="info" text={t.common.emptyCatalog} />);
  if (syncError && status !== 'ready')
    banners.push(<Banner key="err" tone="danger" text={syncError} />);
  return banners.length ? <View className="gap-2">{banners}</View> : null;
}
