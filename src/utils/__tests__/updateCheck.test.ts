import { isNewerVersion, parseLatestRelease, parseVersion, tagFromReleaseUrl } from '../updateCheck';

describe('parseVersion()', () => {
  it('reads plain, v-prefixed, short and pre-release tags', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('1.2')).toEqual([1, 2]);
    expect(parseVersion('1.2.0-beta.1')).toEqual([1, 2, 0]);
  });

  it('rejects anything that is not a version', () => {
    for (const v of ['', 'latest', 'release-2026', '1..2', null, undefined]) expect(parseVersion(v)).toBeNull();
  });
});

describe('isNewerVersion()', () => {
  it('compares numerically, not as text', () => {
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false);
  });

  it('is false for the same version, however it is written', () => {
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });

  it('never calls an older release an update', () => {
    expect(isNewerVersion('0.9.0', '1.0.0')).toBe(false);
  });

  it('never treats an unparseable version as an update', () => {
    expect(isNewerVersion('latest', '1.0.0')).toBe(false);
    expect(isNewerVersion('2.0.0', null)).toBe(false);
  });
});

describe('parseLatestRelease()', () => {
  const release = {
    tag_name: 'v1.1.0',
    html_url: 'https://github.com/Bramha-108/fitcheck/releases/tag/v1.1.0',
    assets: [
      { name: 'checksums.txt', browser_download_url: 'https://github.com/Bramha-108/fitcheck/releases/download/v1.1.0/checksums.txt' },
      { name: 'FitCheck-1.1.0.APK', browser_download_url: 'https://github.com/Bramha-108/fitcheck/releases/download/v1.1.0/FitCheck-1.1.0.APK' },
    ],
  };

  it('prefers the APK asset and strips the v from the tag', () => {
    expect(parseLatestRelease(release)).toEqual({
      version: '1.1.0',
      url: 'https://github.com/Bramha-108/fitcheck/releases/download/v1.1.0/FitCheck-1.1.0.APK',
    });
  });

  it('falls back to the release page when there is no APK attached', () => {
    expect(parseLatestRelease({ ...release, assets: [] })?.url).toBe(release.html_url);
  });

  it('never returns a link outside https://github.com/', () => {
    const hostile = {
      tag_name: 'v9.9.9',
      html_url: 'https://evil.example/fitcheck',
      assets: [{ name: 'fitcheck.apk', browser_download_url: 'http://github.com/x.apk' }],
    };
    expect(parseLatestRelease(hostile)).toBeNull();
  });

  it('rejects a response without a usable version tag', () => {
    expect(parseLatestRelease({ ...release, tag_name: 'nightly' })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease({ message: 'Not Found' })).toBeNull();
  });
});

describe('tagFromReleaseUrl()', () => {
  it('reads the tag from the page "latest release" redirects to', () => {
    expect(tagFromReleaseUrl('https://github.com/Bramha-108/fitcheck/releases/tag/v1.1.1')).toBe('v1.1.1');
    expect(tagFromReleaseUrl('https://github.com/Bramha-108/fitcheck/releases/tag/1.2.0/')).toBe('1.2.0');
  });

  it('rejects anything that is not a github.com release-tag URL with a version', () => {
    for (const u of [
      'https://github.com/Bramha-108/fitcheck/releases', // no release published yet
      'https://github.com/Bramha-108/fitcheck/releases/tag/nightly',
      'https://evil.example/Bramha-108/fitcheck/releases/tag/v9.9.9',
      'http://github.com/Bramha-108/fitcheck/releases/tag/v1.0.0',
      '',
      null,
    ]) expect(tagFromReleaseUrl(u)).toBeNull();
  });
});
