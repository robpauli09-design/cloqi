import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Gender, MascotName } from '@/api';

const IMAGES = {
  cloki: { full: require('../../assets/mascot/cloki-full.png'), bust: require('../../assets/mascot/cloki-bust.png'), head: require('../../assets/mascot/cloki-head.png') },
  clea: { full: require('../../assets/mascot/clea-full.png'), bust: require('../../assets/mascot/clea-bust.png'), head: require('../../assets/mascot/clea-head.png') },
} as const;
const RATIO = { full: 757 / 415, bust: 378 / 415, head: 1 };

/** Same rule as the website (lib/types.ts mascotFor): m → Cloki, w → Clea, d → own choice. */
export const mascotFor = (gender: Gender | null | undefined, chosen: MascotName): MascotName =>
  gender === 'm' ? 'cloki' : gender === 'w' ? 'clea' : chosen;

export function Mascot({ name = 'cloki', variant = 'bust', size = 120, style }: { name?: MascotName; variant?: 'full' | 'bust' | 'head'; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Image source={IMAGES[name][variant]} style={{ width: size, height: size * RATIO[variant] }} resizeMode="contain"
        accessibilityLabel={`${name === 'clea' ? 'Clea' : 'Cloki'}, das CLOQI-Chamäleon`} />
    </View>
  );
}
