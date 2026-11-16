import { Injectable } from '@angular/core';
import type { ApiResult } from '@core/api/api-error';
import type {
  ProductSettingsChange,
  ProductSettingsPage,
} from '@core/api/types';
import { SectionStore } from './section-store';
import type { SettingsSummary } from './settings-summary';

/** The state of the Product section: the defaults every Product conversation starts with, and the history. */
@Injectable()
export class ProductSettingsStore extends SectionStore<ProductSettingsPage> {
  protected readonly section = 'product' as const;

  protected read(): Promise<ApiResult<ProductSettingsPage>> {
    return this.api.getProductSettings();
  }

  protected tell(summary: SettingsSummary, page: ProductSettingsPage): void {
    summary.productRead(page);
  }

  /** Changes the defaults. The answer is the whole page, so it is shown at once; then both are read again. */
  async change(
    body: ProductSettingsChange
  ): Promise<ApiResult<ProductSettingsPage>> {
    const result = await this.api.updateProductSettings(body);
    if (result.ok) this.page.set(result.value);
    await this.load();
    return result;
  }
}
