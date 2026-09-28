// 拼音 above the characters it belongs to.
//
// 注音 never comes through here: its reading is built into the font subset the
// clip carries, so the text renders annotated with no markup at all. 拼音 sits
// above the line and has to be marked up, which is what <ruby> is for — and
// what makes it worth the column: ruby needs the characters and the readings
// separately, one aligned to the other.
type Props = {
  text: string
  // One entry per character of text. Empty where there is nothing to read —
  // punctuation, spaces, digits — which is most of what makes a sentence.
  ruby: string[]
  // The same reading spelled as words, per 《漢語拼音正詞法基本規則》. Preferred
  // over `ruby` wherever it is available, because a reading is spelled per word
  // — 星期六 is xīngqīliù, and 小明 is a name that keeps its capital — and a
  // learner should not meet one convention in a passage and another here.
  words?: { text: string; pinyin: string }[] | null
  className?: string
}

export function RubyText({ text, ruby, words, className }: Props) {
  const characters = [...text]

  // Same rule as the per-character list: a segmentation that does not join
  // back into this exact text would put the readings over the wrong words, so
  // it is not used at all rather than used wrongly.
  if (words?.length && words.map((word) => word.text).join('') === text) {
    return (
      <span className={className}>
        {words.map((word, index) => (
          word.pinyin
            ? <ruby key={index}>{word.text}<rt>{word.pinyin}</rt></ruby>
            : <span key={index}>{word.text}</span>
        ))}
      </span>
    )
  }

  // A list that does not line up would put every syllable over the wrong
  // character, so it is not used at all rather than used wrongly.
  if (ruby.length !== characters.length) return <span className={className}>{text}</span>

  return (
    <span className={className}>
      {characters.map((character, index) => (
        ruby[index]
          ? <ruby key={index}>{character}<rt>{ruby[index]}</rt></ruby>
          // Not wrapped in <ruby>: a character with no reading should sit on
          // the same baseline as the annotated ones, and an empty <rt> pushes
          // it down by the height of a missing syllable.
          : <span key={index}>{character}</span>
      ))}
    </span>
  )
}
