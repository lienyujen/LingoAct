// Labels already stored on older passages need the same script correction as
// newly generated ones. Only grammatical labels pass here, never lesson text.
const simplified: Record<string, string> = {
  詞: '词', 動: '动', 連: '连', 嘆: '叹', 數: '数', 擬: '拟',
  聲: '声', 語: '语', 區: '区', 別: '别', 態: '态', 結: '结', 構: '构',
  歎: '叹', 實: '实', 虛: '虚', 趨: '趋', 狀: '状', 專: '专', 單: '单',
  稱: '称', 關: '关', 係: '系', 補: '补', 謂: '谓', 賓: '宾',
}

export function readingPartOfSpeech(label: string, useSimplified: boolean) {
  return useSimplified ? label.replace(/[詞動連嘆數擬聲語區別態結構歎實虛趨狀專單稱關係補謂賓]/g, character => simplified[character]) : label
}
