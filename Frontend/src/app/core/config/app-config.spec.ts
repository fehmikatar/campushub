import { TestBed } from '@angular/core/testing';
import { AppConfig } from './app-config';
describe('Runtime API configuration', () => {
  afterEach(() => vi.restoreAllMocks());
  it('loads the local configuration from the root even on nested quiz routes', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ apiUrl: '/gateway' }), { status: 200 }));
    const config = TestBed.inject(AppConfig);
    await config.load();
    expect(fetchMock).toHaveBeenCalledWith('/config.local.json', { cache: 'no-store' });
    expect(config.apiUrl).toBe('/gateway');
  });
  it('keeps the default Gateway address if there is no local override', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const config = TestBed.inject(AppConfig);
    await config.load();
    expect(config.apiUrl).toBe('http://localhost:8080');
  });
});
