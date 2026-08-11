export function getSourceImportAvailability(isOnline: boolean) {
  return isOnline
    ? { enabled: true, message: '' }
    : {
        enabled: false,
        message: '当前离线：图片文字可继续整理，AI 来源解析需要联网。',
      }
}
