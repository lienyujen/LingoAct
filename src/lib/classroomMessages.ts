const en = {
  playRecording: 'Play recording', loadingRecording: 'Loading audio…', retryPlayback: 'Reload audio',
  recordingUnavailable: 'Audio could not be loaded. Reload it and try again.', downloadRecording: 'Download audio',
  photoConvertFailed: 'This photo could not be converted. Try taking another photo or choose a JPG or PNG image.',
  photoTooLarge: 'Choose a photo smaller than 20 MB.', closeWall: 'Close sentence wall',
  itemStats: 'Correct {correct} · Needs review {wrong} · Pending {pending} · No answer {missing}',
  needsSupport: 'Students to support ({n})', studentAnswers: 'Answers by student ({n})',
  noAnswer: 'No answer', pending: 'Not graded yet', correct: 'Correct', partial: 'Partial credit', incorrect: 'Incorrect',
  reference: 'Reference answer', showNames: 'Show names', answerDetails: 'Answer details',
}
const translations: Record<string, Partial<typeof en>> = {
  en,
  'zh-TW': {
    playRecording: '播放錄音', loadingRecording: '載入錄音中…', retryPlayback: '重新載入錄音',
    recordingUnavailable: '無法載入錄音，請重新載入後再試。', downloadRecording: '下載錄音',
    photoConvertFailed: '這張照片無法轉成 JPG，請重新拍攝或選擇 JPG、PNG 圖片。', photoTooLarge: '請選擇小於 20 MB 的照片。', closeWall: '關閉句子牆',
    itemStats: '答對 {correct} · 未滿分 {wrong} · 待評 {pending} · 未作答 {missing}',
    needsSupport: '需補強學員（{n}）', studentAnswers: '逐人作答明細（{n}）',
    noAnswer: '未作答', pending: '尚未評分', correct: '答對', partial: '部分得分', incorrect: '答錯',
    reference: '參考答案', showNames: '顯示姓名', answerDetails: '逐題作答明細',
  },
  'zh-CN': {
    playRecording: '播放录音', loadingRecording: '正在加载录音…', retryPlayback: '重新加载录音',
    recordingUnavailable: '无法加载录音，请重新加载后再试。', downloadRecording: '下载录音',
    photoConvertFailed: '这张照片无法转成 JPG，请重新拍摄或选择 JPG、PNG 图片。', photoTooLarge: '请选择小于 20 MB 的照片。', closeWall: '关闭句子墙',
    itemStats: '答对 {correct} · 未满分 {wrong} · 待评 {pending} · 未作答 {missing}',
    needsSupport: '需要巩固的学生（{n}）', studentAnswers: '逐人作答详情（{n}）',
    noAnswer: '未作答', pending: '尚未评分', correct: '答对', partial: '部分得分', incorrect: '答错',
    reference: '参考答案', showNames: '显示姓名', answerDetails: '逐题作答详情',
  },
  ja: {
    playRecording: '録音を再生', loadingRecording: '音声を読み込み中…', retryPlayback: '音声を再読み込み',
    recordingUnavailable: '音声を読み込めませんでした。再読み込みしてください。', downloadRecording: '音声をダウンロード',
    photoConvertFailed: '写真を JPG に変換できませんでした。撮り直すか JPG・PNG 画像を選んでください。', photoTooLarge: '20 MB 未満の写真を選んでください。', closeWall: '文の一覧を閉じる',
    itemStats: '正解 {correct} · 要復習 {wrong} · 採点待ち {pending} · 未回答 {missing}',
    needsSupport: '復習が必要な学習者（{n}）', studentAnswers: '学習者別の回答（{n}）',
    noAnswer: '未回答', pending: '採点待ち', correct: '正解', partial: '部分点', incorrect: '不正解',
    reference: '解答例', showNames: '氏名を表示', answerDetails: '設問別の回答詳細',
  },
  vi: { playRecording: 'Phát bản ghi âm', loadingRecording: 'Đang tải âm thanh…', retryPlayback: 'Tải lại âm thanh', recordingUnavailable: 'Không tải được âm thanh. Vui lòng thử lại.', downloadRecording: 'Tải bản ghi âm', photoConvertFailed: 'Không thể chuyển ảnh sang JPG. Hãy chụp lại hoặc chọn ảnh JPG, PNG.', photoTooLarge: 'Vui lòng chọn ảnh nhỏ hơn 20 MB.' },
  th: { playRecording: 'เล่นเสียงที่บันทึก', loadingRecording: 'กำลังโหลดเสียง…', retryPlayback: 'โหลดเสียงอีกครั้ง', recordingUnavailable: 'โหลดเสียงไม่ได้ กรุณาลองอีกครั้ง', downloadRecording: 'ดาวน์โหลดเสียง', photoConvertFailed: 'แปลงรูปเป็น JPG ไม่ได้ กรุณาถ่ายใหม่หรือเลือกรูป JPG หรือ PNG', photoTooLarge: 'กรุณาเลือกรูปที่มีขนาดเล็กกว่า 20 MB' },
  id: { playRecording: 'Putar rekaman', loadingRecording: 'Memuat audio…', retryPlayback: 'Muat ulang audio', recordingUnavailable: 'Audio tidak dapat dimuat. Silakan coba lagi.', downloadRecording: 'Unduh rekaman', photoConvertFailed: 'Foto tidak dapat diubah menjadi JPG. Ambil foto lagi atau pilih gambar JPG atau PNG.', photoTooLarge: 'Pilih foto berukuran kurang dari 20 MB.' },
  ko: { playRecording: '녹음 재생', loadingRecording: '오디오를 불러오는 중…', retryPlayback: '오디오 다시 불러오기', recordingUnavailable: '오디오를 불러올 수 없습니다. 다시 시도하세요.', downloadRecording: '녹음 다운로드', photoConvertFailed: '사진을 JPG로 변환할 수 없습니다. 다시 촬영하거나 JPG 또는 PNG 이미지를 선택하세요.', photoTooLarge: '20 MB 미만의 사진을 선택하세요.' },
  es: { playRecording: 'Reproducir grabación', loadingRecording: 'Cargando audio…', retryPlayback: 'Volver a cargar el audio', recordingUnavailable: 'No se pudo cargar el audio. Inténtalo de nuevo.', downloadRecording: 'Descargar grabación', photoConvertFailed: 'No se pudo convertir la foto a JPG. Toma otra foto o elige una imagen JPG o PNG.', photoTooLarge: 'Elige una foto de menos de 20 MB.' },
}
export function classroomMessage(locale: string, key: keyof typeof en, values: Record<string, string | number> = {}) {
  return (translations[locale]?.[key] || en[key]).replace(/\{(\w+)\}/g, (whole, name: string) => name in values ? String(values[name]) : whole)
}
