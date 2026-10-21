import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';

/** Captures a view as PNG and opens the share sheet (WhatsApp, Discord…). Returns a pt-BR notice on failure. */
export async function shareViewAsImage(
  ref: RefObject<unknown>,
  dialogTitle: string,
): Promise<string | null> {
  try {
    const uri = await captureRef(ref.current as Parameters<typeof captureRef>[0], {
      format: 'png',
      quality: 1,
    });
    if (!(await Sharing.isAvailableAsync()))
      return 'Compartilhamento de imagem indisponível neste dispositivo.';
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
    return null;
  } catch {
    return 'Não foi possível gerar a imagem.';
  }
}
