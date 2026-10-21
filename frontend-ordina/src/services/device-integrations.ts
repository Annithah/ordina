import * as Contacts from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { IMAGE_MAX_EDGE, PICKER_TYPES } from '@/features/attachments';

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

export type PickedFile = { uri: string; name: string; mimeType: string; size: number; isImage: boolean; isVideo: boolean };

const MAX_VIDEO_SECONDS = 60;

function fileSize(uri: string) {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

function fromPickerAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
  return {
    uri: asset.uri,
    name: asset.fileName || asset.uri.split('/').pop() || (isVideo ? 'video.mp4' : 'photo.jpg'),
    mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
    size: asset.fileSize ?? fileSize(asset.uri),
    isImage: !isVideo,
    isVideo,
  };
}

export type PermissionResult = 'granted' | 'denied' | 'blocked';

/** Camera permission, asked only when the camera is first used. "blocked": only Settings can change it. */
export async function cameraPermission(): Promise<PermissionResult> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';
  const asked = await ImagePicker.requestCameraPermissionsAsync();
  return asked.granted ? 'granted' : asked.canAskAgain ? 'denied' : 'blocked';
}

export async function cameraPermissionStatus() {
  return (await ImagePicker.getCameraPermissionsAsync()).status;
}

/** One photo from the camera. */
export async function takePhoto(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  return result.canceled ? [] : result.assets.map(fromPickerAsset);
}

/** Photos or short videos from the gallery. The system picker needs no permission. */
export async function pickPhotos(limit: number): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.8,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  return result.canceled ? [] : result.assets.slice(0, limit).map(fromPickerAsset);
}

/** PDFs, Word documents, TXT, CSV or images from Files, Downloads, Drive... */
export async function pickDocuments(limit: number): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: limit > 1 });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => {
    const mimeType = asset.mimeType || 'application/octet-stream';
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType,
      size: asset.size ?? fileSize(asset.uri),
      isImage: mimeType.startsWith('image/'),
      isVideo: mimeType.startsWith('video/'),
    };
  });
}

/**
 * Photos are made smaller before upload and always saved as JPG (HEIC and PNG become JPG).
 * Other files are sent as they are.
 */
export async function compressForUpload(file: PickedFile): Promise<PickedFile> {
  if (!file.isImage) return file;
  try {
    const context = ImageManipulator.manipulate(file.uri);
    const original = await context.renderAsync();
    const longEdge = Math.max(original.width, original.height);
    const resized = longEdge > IMAGE_MAX_EDGE
      ? await ImageManipulator.manipulate(file.uri)
        .resize(original.width >= original.height ? { width: IMAGE_MAX_EDGE } : { height: IMAGE_MAX_EDGE })
        .renderAsync()
      : original;
    const saved = await resized.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
    return {
      ...file,
      uri: saved.uri,
      mimeType: 'image/jpeg',
      name: file.name.replace(/\.(heic|heif|png|webp|jpe?g)$/i, '') + '.jpg',
      size: fileSize(saved.uri) || file.size,
    };
  } catch {
    return file;
  }
}
