import { render, screen } from '@testing-library/react-native';
import AboutScreen from '@/app/about';
import { DATA_SOURCES } from '@/lib/sources';

describe('About screen', () => {
  it('shows the exact Legal Jibber Jabber notice and the unofficial disclaimer', async () => {
    await render(<AboutScreen />);
    expect(
      screen.getByText(
        "RiftBuild was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('legal-notice-pt')).toHaveTextContent(/não oficial/);
  });

  it('attributes every data source, including the CC BY-SA wiki license', async () => {
    await render(<AboutScreen />);
    for (const source of DATA_SOURCES) {
      expect(screen.getByTestId(`source-${source.id}`)).toBeTruthy();
    }
    expect(screen.getByText(/CC BY-SA 3\.0/)).toBeTruthy();
  });
});
