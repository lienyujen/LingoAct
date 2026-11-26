// These terms point to bundled, individually reviewed illustrations. Match a
// whole term so an idiom or a sentence containing the word stays text-only.
const illustrations: Record<string, readonly string[]> = {
  'airplane': ['airplane', 'aeroplane', '飛機', '飞机', '飛行機'],
  'ambulance': ['ambulance', '救護車', '救护车', '救急車'],
  'avocado': ['avocado', '酪梨', '牛油果', 'アボカド'],
  'backpack': ['backpack', 'rucksack', '背包', '後背包', '双肩包', 'リュック', 'リュックサック'],
  'balloon': ['balloon', '氣球', '气球', '風船'],
  'bicycle': ['bicycle', '腳踏車', '脚踏车', '自行車', '自行车', '單車', '单车', '自転車'],
  'broccoli': ['broccoli', '青花菜', '綠花椰菜', '西兰花', 'ブロッコリー'],
  'butterfly': ['butterfly', '蝴蝶', 'チョウ', '蝶々', 'ちょうちょ'],
  'camera': ['camera', '相機', '相机', '照相機', '照相机', 'カメラ'],
  'carrot': ['carrot', '胡蘿蔔', '胡萝卜', '紅蘿蔔', '红萝卜', 'にんじん', 'ニンジン'],
  'chopsticks': ['chopsticks', '筷子', '箸', 'お箸'],
  'coconut': ['coconut', '椰子', 'ココナッツ'],
  'cucumber': ['cucumber', '小黃瓜', '黄瓜', 'きゅうり', 'キュウリ'],
  'dolphin': ['dolphin', '海豚', 'イルカ'],
  'elephant': ['elephant', '大象', '象', 'ゾウ'],
  'giraffe': ['giraffe', '長頸鹿', '长颈鹿', 'キリン', 'きりん'],
  'grapes': ['grapes', 'grape', '葡萄', 'ぶどう'],
  'hamburger': ['hamburger', '漢堡', '汉堡', 'ハンバーガー'],
  'helicopter': ['helicopter', '直升機', '直升机', 'ヘリコプター'],
  'kiwi-fruit': ['kiwifruit', 'kiwi fruit', '奇異果', '猕猴桃', 'キウイフルーツ'],
  'lemon': ['lemon', '檸檬', '柠檬', 'レモン'],
  'mango': ['mango', '芒果', 'マンゴー'],
  'octopus': ['octopus', '章魚', '章鱼', 'タコ'],
  'onion': ['onion', '洋蔥', '洋葱', '玉ねぎ', 'タマネギ'],
  'panda': ['panda', '熊貓', '熊猫', '大貓熊', '大熊貓', '大熊猫', 'パンダ'],
  'pencil': ['pencil', '鉛筆', '铅笔', 'えんぴつ'],
  'penguin': ['penguin', '企鵝', '企鹅', 'ペンギン'],
  'pineapple': ['pineapple', '鳳梨', '凤梨', '菠蘿', '菠萝', 'パイナップル'],
  'popcorn': ['popcorn', '爆米花', 'ポップコーン'],
  'rabbit': ['rabbit', '兔子', '兔', 'ウサギ', 'うさぎ'],
  'rainbow': ['rainbow', '彩虹', '虹'],
  'scissors': ['scissors', '剪刀', 'はさみ', 'ハサミ'],
  'skateboard': ['skateboard', '滑板', 'スケートボード'],
  'snail': ['snail', '蝸牛', '蜗牛', 'かたつむり', 'カタツムリ'],
  'strawberry': ['strawberry', '草莓', 'いちご', 'イチゴ', '苺'],
  'sunglasses': ['sunglasses', '太陽眼鏡', '太阳眼镜', '墨鏡', '墨镜', 'サングラス'],
  'telescope': ['telescope', '望遠鏡', '望远镜', '天体望遠鏡'],
  'tomato': ['tomato', '番茄', '蕃茄', '西紅柿', '西红柿', 'トマト'],
  'toothbrush': ['toothbrush', '牙刷', '歯ブラシ'],
  'umbrella': ['umbrella', '雨傘', '雨伞', '傘', '伞'],
  'violin': ['violin', '小提琴', 'バイオリン', 'ヴァイオリン'],
  'water-buffalo': ['water buffalo', '水牛', 'スイギュウ'],
  'watermelon': ['watermelon', '西瓜', 'スイカ', 'すいか'],
}

const byWord = new Map(Object.entries(illustrations).flatMap(([image, words]) => words.map((word) => [word, image] as const)))

export function flashcardPicture(word: string) {
  const query = word.trim()
  const image = byWord.get(query.normalize('NFKC').toLowerCase())
  if (!image) return null
  return {
    src: `${import.meta.env.BASE_URL}flashcard-images/${image}.png`,
    searchUrl: `https://www.google.com/search?${new URLSearchParams({ q: query, tbm: 'isch', safe: 'active' })}`,
  }
}
