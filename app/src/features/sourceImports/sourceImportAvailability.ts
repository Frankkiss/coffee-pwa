export function getSourceImportAvailability(isOnline: boolean) {
  return isOnline
    ? { enabled: true, message: '' }
    : {
        enabled: false,
        message: '当前离线：图片和文字的 AI 解析需要联网；已选择内容会保留。',
      }
}
