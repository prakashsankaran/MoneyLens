import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { DeviceFiles } from '../../../web/src/lib/device';

/**
 * The phone's web view cannot download files, so a backup or CSV export is
 * written to the app's cache and handed to Android's share sheet, where the
 * person picks Files, Drive, WhatsApp to themselves or email. The cached copy
 * is replaced by the next save.
 */
export const deviceFiles: DeviceFiles = {
  async save(name, text) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Save or send the file' });
    } catch (err) {
      // Closing the share sheet is not an error.
      if (!/cancel/i.test(String((err as Error)?.message ?? err))) throw err;
    }
  },
};
