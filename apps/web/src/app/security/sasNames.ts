// The Matrix SAS emoji table by index (matrix-spec data-definitions/sas-emoji.json: `description` and
// `translated_descriptions.ja`), so both devices and Element X show the same names.
const en = [
  'Dog', 'Cat', 'Lion', 'Horse', 'Unicorn', 'Pig', 'Elephant', 'Rabbit', 'Panda', 'Rooster', 'Penguin', 'Turtle', 'Fish', 'Octopus', 'Butterfly', 'Flower',
  'Tree', 'Cactus', 'Mushroom', 'Globe', 'Moon', 'Cloud', 'Fire', 'Banana', 'Apple', 'Strawberry', 'Corn', 'Pizza', 'Cake', 'Heart', 'Smiley', 'Robot',
  'Hat', 'Glasses', 'Spanner', 'Santa', 'Thumbs Up', 'Umbrella', 'Hourglass', 'Clock', 'Gift', 'Light Bulb', 'Book', 'Pencil', 'Paperclip', 'Scissors', 'Lock', 'Key',
  'Hammer', 'Telephone', 'Flag', 'Train', 'Bicycle', 'Aeroplane', 'Rocket', 'Trophy', 'Ball', 'Guitar', 'Trumpet', 'Bell', 'Anchor', 'Headphones', 'Folder', 'Pin',
];
const ja = [
  '犬', '猫', 'ライオン', '馬', 'ユニコーン', 'ブタ', 'ゾウ', 'うさぎ', 'パンダ', 'ニワトリ', 'ペンギン', '亀', '魚', 'たこ', 'ちょうちょ', '花',
  '木', 'サボテン', 'きのこ', '地球', '月', '雲', '炎', 'バナナ', 'リンゴ', 'いちご', 'とうもろこし', 'ピザ', 'ケーキ', 'ハート', 'スマイル', 'ロボット',
  '帽子', 'めがね', 'スパナ', 'サンタ', 'いいね', '傘', '砂時計', '時計', 'ギフト', '電球', '本', '鉛筆', 'クリップ', 'はさみ', '錠前', '鍵',
  '金槌', '電話機', '旗', '電車', '自転車', '飛行機', 'ロケット', 'トロフィー', 'ボール', 'ギター', 'トランペット', 'ベル', 'いかり', 'ヘッドホン', 'フォルダー', 'ピン',
];

export function sasName(index: number, language: string): string {
  return (language.startsWith('ja') ? ja : en)[index] ?? '';
}
