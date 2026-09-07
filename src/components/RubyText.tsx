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
  className?: string
}

export function RubyText({ text, ruby, className }: Props) {
  const characters = [...text]
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
