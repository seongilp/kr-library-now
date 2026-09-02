import { LibrariesBrowser } from '@/components/libraries-browser';

/**
 * 앱 본체. 지도가 첫 화면. 도서관 168곳은 작아서 전량을 클라이언트로 내리고, 거리 정렬·필터는
 * 클라이언트가 한다. 좌석은 짧은 TTL 로 따로 받아 도서관에 합친다.
 */
export default function MapPage() {
  return <LibrariesBrowser />;
}
