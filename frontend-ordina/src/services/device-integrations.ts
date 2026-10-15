import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';

export type MatchedContact = { name: string; phone?: string };

/** Contacts whose names appear in the instruction. Only these matches leave the device, never the address book. */
export async function matchingContacts(message: string): Promise<MatchedContact[]> {
  const permission = await Contacts.getPermissionsAsync();
  if (!permission.granted) return [];
  const words = message.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  if (!words.length) return [];
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });
  return data
    .filter((contact) => {
      const parts = (contact.name || '').toLowerCase().split(/\s+/);
      return parts.some((part) => part.length > 2 && words.includes(part));
    })
    .slice(0, 8)
    .map((contact) => {
      const phone = contact.phoneNumbers?.find((item) => item.isPrimary)?.number ?? contact.phoneNumbers?.[0]?.number;
      return { name: contact.name || 'Unknown', phone: phone || undefined };
    });
}

/** Gemini accepts up to ~20 MB inline; base64 adds a third, so keep raw media below this. */
export const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 60;

export type MediaSource = 'camera-photo' | 'camera-video' | 'library';

export async function pickTaskMedia(source: MediaSource) {
  if (source === 'library') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('Allow photo library access in Settings to attach images or videos.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.6,
      videoMaxDuration: MAX_VIDEO_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    return result.canceled ? null : result.assets[0];
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Allow camera access in Settings to capture tasks.');
  if (source === 'camera-video') {
    const { requestRecordingPermissionsAsync } = await import('expo-audio');
    const microphone = await requestRecordingPermissionsAsync();
    if (!microphone.granted) throw new Error('Allow microphone access so ORDINA can hear your video.');
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: source === 'camera-video' ? ['videos'] : ['images'],
    quality: 0.6,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  return result.canceled ? null : result.assets[0];
}
