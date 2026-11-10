import type { ActorEntry, ArtworkCandidate, RatingEntry, UniqueIds } from '../../shared/types.js';

export interface CatalogMovieEntry {
  key: string;
  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number;
  premiered: string;
  tagline: string;
  plot: string;
  outline: string;
  runtimeMinutes: number;
  mpaa: string;
  country: string;
  studios: string[];
  genres: string[];
  tags: string[];
  directors: string[];
  writers: string[];
  actors: ActorEntry[];
  trailerUrl: string;
  setName?: string;
  setOverview?: string;
  tmdbCollectionId?: string;
  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  accentColor: string;
  secondaryColor: string;
}

export interface CatalogTvEpisodeEntry {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  aired: string;
  plot: string;
  runtimeMinutes: number;
  directors: string[];
  writers: string[];
  ratings: RatingEntry[];
}

export interface CatalogTvShowEntry {
  key: string;
  title: string;
  originalTitle: string;
  sortTitle: string;
  year: number;
  premiered: string;
  status: 'Continuing' | 'Ended';
  plot: string;
  mpaa: string;
  studio: string;
  genres: string[];
  tags: string[];
  actors: ActorEntry[];
  uniqueIds: UniqueIds;
  ratings: RatingEntry[];
  accentColor: string;
  secondaryColor: string;
  seasons: Array<{ seasonNumber: number; name: string; overview: string }>;
  episodes: CatalogTvEpisodeEntry[];
}

export const CATALOG_MOVIES: CatalogMovieEntry[] = [
  {
    key: 'blade-runner-2049',
    title: 'Blade Runner 2049',
    originalTitle: 'Blade Runner 2049',
    sortTitle: 'Blade Runner 2049',
    year: 2017,
    premiered: '2017-10-06',
    tagline: 'The key to the future is finally unearthed.',
    plot: "Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos. K's discovery leads him on a quest to find Rick Deckard, a former LAPD blade runner who has been missing for 30 years.",
    outline: 'Young Blade Runner K discovers a long-buried secret and sets out to find Rick Deckard.',
    runtimeMinutes: 164,
    mpaa: 'Rated R',
    country: 'United States',
    studios: ['Alcon Entertainment', 'Columbia Pictures', 'Scott Free Productions'],
    genres: ['Science Fiction', 'Drama', 'Mystery'],
    tags: ['cyberpunk', 'dystopia', 'neo-noir', 'artificial intelligence', 'sequel'],
    directors: ['Denis Villeneuve'],
    writers: ['Hampton Fancher', 'Michael Green'],
    actors: [
      { name: 'Ryan Gosling', role: 'Officer K', order: 0 },
      { name: 'Harrison Ford', role: 'Rick Deckard', order: 1 },
      { name: 'Ana de Armas', role: 'Joi', order: 2 },
      { name: 'Sylvia Hoeks', role: 'Luv', order: 3 },
      { name: 'Jared Leto', role: 'Niander Wallace', order: 4 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=gCcx85zbxz4',
    setName: 'Blade Runner Collection',
    setOverview: 'Sci-fi neo-noir films set in a dystopian future exploring humanity and synthetic replicants.',
    tmdbCollectionId: '422837',
    uniqueIds: { imdb: 'tt1856101', tmdb: '335984', trakt: '227498' },
    ratings: [
      { source: 'imdb', value: 8.0, max: 10, votes: 678000, isDefault: true },
      { source: 'tmdb', value: 7.6, max: 10, votes: 13400 },
      { source: 'rottentomatoes', value: 88, max: 100, votes: 451 },
      { source: 'metacritic', value: 81, max: 100, votes: 54 },
      { source: 'trakt', value: 8.1, max: 10, votes: 41200 },
    ],
    accentColor: '#f97316',
    secondaryColor: '#38bdf8',
  },
  {
    key: 'blade-runner-1982',
    title: 'Blade Runner',
    originalTitle: 'Blade Runner',
    sortTitle: 'Blade Runner 1982',
    year: 1982,
    premiered: '1982-06-25',
    tagline: 'Man has made his match... now it\'s his problem.',
    plot: 'In the smog-choked dystopian Los Angeles of 2019, blade runner Rick Deckard is called out of retirement to terminate a quartet of replicants who have escaped to Earth seeking their creator for a way to extend their short life spans.',
    outline: 'A blade runner must pursue and terminate four replicants who stole a ship in space and returned to Earth.',
    runtimeMinutes: 117,
    mpaa: 'Rated R',
    country: 'United States',
    studios: ['The Ladd Company', 'Shaw Brothers', 'Warner Bros.'],
    genres: ['Science Fiction', 'Drama', 'Thriller'],
    tags: ['cyberpunk', 'replicant', 'neo-noir', 'cult classic'],
    directors: ['Ridley Scott'],
    writers: ['Hampton Fancher', 'David Peoples'],
    actors: [
      { name: 'Harrison Ford', role: 'Rick Deckard', order: 0 },
      { name: 'Rutger Hauer', role: 'Roy Batty', order: 1 },
      { name: 'Sean Young', role: 'Rachael', order: 2 },
      { name: 'Edward James Olmos', role: 'Gaff', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=eogpIG53Cis',
    setName: 'Blade Runner Collection',
    setOverview: 'Sci-fi neo-noir films set in a dystopian future exploring humanity and synthetic replicants.',
    tmdbCollectionId: '422837',
    uniqueIds: { imdb: 'tt0083658', tmdb: '78', trakt: '72' },
    ratings: [
      { source: 'imdb', value: 8.1, max: 10, votes: 834000, isDefault: true },
      { source: 'tmdb', value: 7.9, max: 10, votes: 13800 },
      { source: 'rottentomatoes', value: 89, max: 100, votes: 138 },
      { source: 'metacritic', value: 84, max: 100, votes: 15 },
      { source: 'trakt', value: 8.2, max: 10, votes: 31500 },
    ],
    accentColor: '#0ea5e9',
    secondaryColor: '#f59e0b',
  },
  {
    key: 'dune-2021',
    title: 'Dune',
    originalTitle: 'Dune: Part One',
    sortTitle: 'Dune 1',
    year: 2021,
    premiered: '2021-10-22',
    tagline: 'Beyond fear, destiny awaits.',
    plot: 'Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, must travel to the most dangerous planet in the universe to ensure the future of his family and his people.',
    outline: 'A noble family becomes embroiled in a war for control over the galaxy\'s most valuable asset.',
    runtimeMinutes: 155,
    mpaa: 'Rated PG-13',
    country: 'United States',
    studios: ['Legendary Pictures', 'Villeneuve Films', 'Warner Bros.'],
    genres: ['Science Fiction', 'Adventure'],
    tags: ['desert', 'space opera', 'epic', 'prophecy', 'based on novel'],
    directors: ['Denis Villeneuve'],
    writers: ['Jon Spaihts', 'Denis Villeneuve', 'Eric Roth'],
    actors: [
      { name: 'Timothée Chalamet', role: 'Paul Atreides', order: 0 },
      { name: 'Rebecca Ferguson', role: 'Lady Jessica Atreides', order: 1 },
      { name: 'Oscar Isaac', role: 'Duke Leto Atreides', order: 2 },
      { name: 'Zendaya', role: 'Chani', order: 3 },
      { name: 'Josh Brolin', role: 'Gurney Halleck', order: 4 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=8g18jFHCLXk',
    setName: 'Dune Collection',
    setOverview: 'Denis Villeneuve\'s epic adaptation of Frank Herbert\'s seminal sci-fi saga set on the desert world Arrakis.',
    tmdbCollectionId: '726871',
    uniqueIds: { imdb: 'tt1160419', tmdb: '438631', trakt: '337161' },
    ratings: [
      { source: 'imdb', value: 8.0, max: 10, votes: 892000, isDefault: true },
      { source: 'tmdb', value: 7.8, max: 10, votes: 12400 },
      { source: 'rottentomatoes', value: 83, max: 100, votes: 514 },
      { source: 'metacritic', value: 74, max: 100, votes: 68 },
      { source: 'trakt', value: 8.1, max: 10, votes: 52000 },
    ],
    accentColor: '#d97706',
    secondaryColor: '#fde68a',
  },
  {
    key: 'dune-part-two-2024',
    title: 'Dune: Part Two',
    originalTitle: 'Dune: Part Two',
    sortTitle: 'Dune 2',
    year: 2024,
    premiered: '2024-03-01',
    tagline: 'Long live the fighters.',
    plot: 'Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a warpath of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe.',
    outline: 'Paul Atreides unites with the Fremen to avenge his family and prevent a terrible future.',
    runtimeMinutes: 166,
    mpaa: 'Rated PG-13',
    country: 'United States',
    studios: ['Legendary Pictures', 'Warner Bros.'],
    genres: ['Science Fiction', 'Adventure'],
    tags: ['desert', 'imax', 'sandworm', 'space opera', 'epic'],
    directors: ['Denis Villeneuve'],
    writers: ['Denis Villeneuve', 'Jon Spaihts'],
    actors: [
      { name: 'Timothée Chalamet', role: 'Paul Atreides', order: 0 },
      { name: 'Zendaya', role: 'Chani', order: 1 },
      { name: 'Rebecca Ferguson', role: 'Lady Jessica', order: 2 },
      { name: 'Javier Bardem', role: 'Stilgar', order: 3 },
      { name: 'Austin Butler', role: 'Feyd-Rautha Harkonnen', order: 4 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=Way9Dexny3w',
    setName: 'Dune Collection',
    setOverview: 'Denis Villeneuve\'s epic adaptation of Frank Herbert\'s seminal sci-fi saga set on the desert world Arrakis.',
    tmdbCollectionId: '726871',
    uniqueIds: { imdb: 'tt15239678', tmdb: '693134', trakt: '509551' },
    ratings: [
      { source: 'imdb', value: 8.5, max: 10, votes: 530000, isDefault: true },
      { source: 'tmdb', value: 8.2, max: 10, votes: 5600 },
      { source: 'rottentomatoes', value: 92, max: 100, votes: 462 },
      { source: 'metacritic', value: 79, max: 100, votes: 62 },
      { source: 'trakt', value: 8.6, max: 10, votes: 41800 },
    ],
    accentColor: '#ea580c',
    secondaryColor: '#fbbf24',
  },
  {
    key: 'inception-2010',
    title: 'Inception',
    originalTitle: 'Inception',
    sortTitle: 'Inception',
    year: 2010,
    premiered: '2010-07-16',
    tagline: 'Your mind is the scene of the crime.',
    plot: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets is offered a chance to regain his old life as payment for a task considered to be impossible: inception, the implantation of another person\'s idea into a target\'s subconscious.',
    outline: 'A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.',
    runtimeMinutes: 148,
    mpaa: 'Rated PG-13',
    country: 'United States',
    studios: ['Warner Bros.', 'Legendary Pictures', 'Syncopy'],
    genres: ['Action', 'Science Fiction', 'Adventure'],
    tags: ['heist', 'dreams', 'mind-bending', 'subconscious'],
    directors: ['Christopher Nolan'],
    writers: ['Christopher Nolan'],
    actors: [
      { name: 'Leonardo DiCaprio', role: 'Dom Cobb', order: 0 },
      { name: 'Joseph Gordon-Levitt', role: 'Arthur', order: 1 },
      { name: 'Elliot Page', role: 'Ariadne', order: 2 },
      { name: 'Tom Hardy', role: 'Eames', order: 3 },
      { name: 'Ken Watanabe', role: 'Saito', order: 4 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=YoHD9XEInc0',
    uniqueIds: { imdb: 'tt1375666', tmdb: '27205', trakt: '16662' },
    ratings: [
      { source: 'imdb', value: 8.8, max: 10, votes: 2600000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 36500 },
      { source: 'rottentomatoes', value: 87, max: 100, votes: 365 },
      { source: 'metacritic', value: 74, max: 100, votes: 42 },
      { source: 'trakt', value: 8.6, max: 10, votes: 89000 },
    ],
    accentColor: '#2563eb',
    secondaryColor: '#93c5fd',
  },
  {
    key: 'interstellar-2014',
    title: 'Interstellar',
    originalTitle: 'Interstellar',
    sortTitle: 'Interstellar',
    year: 2014,
    premiered: '2014-11-07',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    plot: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.',
    outline: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.',
    runtimeMinutes: 169,
    mpaa: 'Rated PG-13',
    country: 'United States',
    studios: ['Paramount Pictures', 'Warner Bros.', 'Syncopy'],
    genres: ['Adventure', 'Drama', 'Science Fiction'],
    tags: ['space', 'wormhole', 'time dilation', 'black hole'],
    directors: ['Christopher Nolan'],
    writers: ['Jonathan Nolan', 'Christopher Nolan'],
    actors: [
      { name: 'Matthew McConaughey', role: 'Joseph Cooper', order: 0 },
      { name: 'Anne Hathaway', role: 'Dr. Amelia Brand', order: 1 },
      { name: 'Jessica Chastain', role: 'Murphy Cooper', order: 2 },
      { name: 'Michael Caine', role: 'Professor John Brand', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=zSWdZVtXT7E',
    uniqueIds: { imdb: 'tt0816692', tmdb: '157336', trakt: '102156' },
    ratings: [
      { source: 'imdb', value: 8.7, max: 10, votes: 2200000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 35600 },
      { source: 'rottentomatoes', value: 73, max: 100, votes: 377 },
      { source: 'metacritic', value: 74, max: 100, votes: 46 },
      { source: 'trakt', value: 8.6, max: 10, votes: 95000 },
    ],
    accentColor: '#0284c7',
    secondaryColor: '#e0f2fe',
  },
  {
    key: 'lotr-fellowship-2001',
    title: 'The Lord of the Rings: The Fellowship of the Ring',
    originalTitle: 'The Lord of the Rings: The Fellowship of the Ring',
    sortTitle: 'Lord of the Rings 1',
    year: 2001,
    premiered: '2001-12-19',
    tagline: 'One ring to rule them all.',
    plot: 'Young hobbit Frodo Baggins, after inheriting a mysterious ring from his uncle Bilbo, must leave his home in order to keep it from falling into the hands of its evil creator.',
    outline: 'A meek Hobbit from the Shire and eight companions set out on a journey to destroy the powerful One Ring.',
    runtimeMinutes: 178,
    mpaa: 'Rated PG-13',
    country: 'New Zealand',
    studios: ['New Line Cinema', 'WingNut Films'],
    genres: ['Adventure', 'Fantasy', 'Action'],
    tags: ['middle-earth', 'epic', 'quest', 'magic'],
    directors: ['Peter Jackson'],
    writers: ['Fran Walsh', 'Philippa Boyens', 'Peter Jackson'],
    actors: [
      { name: 'Elijah Wood', role: 'Frodo Baggins', order: 0 },
      { name: 'Ian McKellen', role: 'Gandalf the Grey', order: 1 },
      { name: 'Viggo Mortensen', role: 'Aragorn', order: 2 },
      { name: 'Sean Astin', role: 'Samwise Gamgee', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=V75dMMIW2B4',
    setName: 'The Lord of the Rings Collection',
    setOverview: 'Peter Jackson\'s landmark epic fantasy trilogy based on J.R.R. Tolkien\'s novels.',
    tmdbCollectionId: '119',
    uniqueIds: { imdb: 'tt0120737', tmdb: '120', trakt: '90' },
    ratings: [
      { source: 'imdb', value: 8.9, max: 10, votes: 2050000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 25100 },
      { source: 'rottentomatoes', value: 92, max: 100, votes: 236 },
      { source: 'metacritic', value: 92, max: 100, votes: 34 },
      { source: 'trakt', value: 8.7, max: 10, votes: 67000 },
    ],
    accentColor: '#10b981',
    secondaryColor: '#fde047',
  },
  {
    key: 'lotr-two-towers-2002',
    title: 'The Lord of the Rings: The Two Towers',
    originalTitle: 'The Lord of the Rings: The Two Towers',
    sortTitle: 'Lord of the Rings 2',
    year: 2002,
    premiered: '2002-12-18',
    tagline: 'A New Power Is Rising.',
    plot: 'Frodo and Sam are trekking to Mordor to destroy the One Ring of Power while Gimli, Legolas and Aragorn search for the orc-captured Merry and Pippin.',
    outline: 'While Frodo and Sam edge closer to Mordor, the divided fellowship makes a stand against Sauron\'s new ally Saruman.',
    runtimeMinutes: 179,
    mpaa: 'Rated PG-13',
    country: 'New Zealand',
    studios: ['New Line Cinema', 'WingNut Films'],
    genres: ['Adventure', 'Fantasy', 'Action'],
    tags: ['middle-earth', 'epic', 'battle', 'helms deep'],
    directors: ['Peter Jackson'],
    writers: ['Fran Walsh', 'Philippa Boyens', 'Stephen Sinclair', 'Peter Jackson'],
    actors: [
      { name: 'Elijah Wood', role: 'Frodo Baggins', order: 0 },
      { name: 'Ian McKellen', role: 'Gandalf the White', order: 1 },
      { name: 'Viggo Mortensen', role: 'Aragorn', order: 2 },
      { name: 'Andy Serkis', role: 'Gollum / Sméagol', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=LbfY5fX_3dU',
    setName: 'The Lord of the Rings Collection',
    setOverview: 'Peter Jackson\'s landmark epic fantasy trilogy based on J.R.R. Tolkien\'s novels.',
    tmdbCollectionId: '119',
    uniqueIds: { imdb: 'tt0167261', tmdb: '121', trakt: '91' },
    ratings: [
      { source: 'imdb', value: 8.8, max: 10, votes: 1830000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 21800 },
      { source: 'rottentomatoes', value: 95, max: 100, votes: 259 },
      { source: 'metacritic', value: 87, max: 100, votes: 39 },
      { source: 'trakt', value: 8.6, max: 10, votes: 61000 },
    ],
    accentColor: '#059669',
    secondaryColor: '#fcd34d',
  },
  {
    key: 'spider-verse-2018',
    title: 'Spider-Man: Into the Spider-Verse',
    originalTitle: 'Spider-Man: Into the Spider-Verse',
    sortTitle: 'Spider-Verse 1',
    year: 2018,
    premiered: '2018-12-14',
    tagline: 'More than one wears the mask.',
    plot: 'Struggling to find his place in the world while juggling school and family, Brooklyn teenager Miles Morales is unexpectedly bitten by a radioactive spider and develops unfathomable powers just like the one and only Spider-Man.',
    outline: 'Teen Miles Morales becomes the Spider-Man of his universe and must join with five spider-powered individuals from other dimensions.',
    runtimeMinutes: 117,
    mpaa: 'Rated PG',
    country: 'United States',
    studios: ['Sony Pictures Animation', 'Columbia Pictures', 'Marvel Entertainment'],
    genres: ['Animation', 'Action', 'Adventure', 'Science Fiction'],
    tags: ['multiverse', 'superhero', 'comic book style'],
    directors: ['Bob Persichetti', 'Peter Ramsey', 'Rodney Rothman'],
    writers: ['Phil Lord', 'Rodney Rothman'],
    actors: [
      { name: 'Shameik Moore', role: 'Miles Morales (voice)', order: 0 },
      { name: 'Jake Johnson', role: 'Peter B. Parker (voice)', order: 1 },
      { name: 'Hailee Steinfeld', role: 'Gwen Stacy (voice)', order: 2 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=g4Hbz2jLxvQ',
    setName: 'Spider-Verse Collection',
    setOverview: 'Animated multiverse saga following Miles Morales and Spider-People across realities.',
    tmdbCollectionId: '573436',
    uniqueIds: { imdb: 'tt4633694', tmdb: '324857', trakt: '218510' },
    ratings: [
      { source: 'imdb', value: 8.4, max: 10, votes: 702000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 15600 },
      { source: 'rottentomatoes', value: 97, max: 100, votes: 398 },
      { source: 'metacritic', value: 87, max: 100, votes: 50 },
      { source: 'trakt', value: 8.5, max: 10, votes: 54000 },
    ],
    accentColor: '#e11d48',
    secondaryColor: '#38bdf8',
  },
  {
    key: 'spirited-away-2001',
    title: 'Spirited Away',
    originalTitle: '千と千尋の神隠し',
    sortTitle: 'Spirited Away',
    year: 2001,
    premiered: '2001-07-20',
    tagline: 'The tunnel led Chihiro to a mysterious town...',
    plot: 'A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had to free her family.',
    outline: 'During her family\'s move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits.',
    runtimeMinutes: 125,
    mpaa: 'Rated PG',
    country: 'Japan',
    studios: ['Studio Ghibli'],
    genres: ['Animation', 'Family', 'Fantasy'],
    tags: ['anime', 'studio ghibli', 'spirit world', 'oscar winner'],
    directors: ['Hayao Miyazaki'],
    writers: ['Hayao Miyazaki'],
    actors: [
      { name: 'Rumi Hiiragi', role: 'Chihiro Ogino (voice)', order: 0 },
      { name: 'Miyu Irino', role: 'Haku (voice)', order: 1 },
      { name: 'Mari Natsuki', role: 'Yubaba / Zeniba (voice)', order: 2 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=ByXuk9QqQkk',
    uniqueIds: { imdb: 'tt0245429', tmdb: '129', mal: '199', trakt: '100' },
    ratings: [
      { source: 'imdb', value: 8.6, max: 10, votes: 878000, isDefault: true },
      { source: 'tmdb', value: 8.5, max: 10, votes: 16400 },
      { source: 'rottentomatoes', value: 96, max: 100, votes: 196 },
      { source: 'metacritic', value: 96, max: 100, votes: 41 },
      { source: 'mal', value: 8.77, max: 10, votes: 1240000 },
    ],
    accentColor: '#8b5cf6',
    secondaryColor: '#f472b6',
  },
  {
    key: 'parasite-2019',
    title: 'Parasite',
    originalTitle: '기생충',
    sortTitle: 'Parasite',
    year: 2019,
    premiered: '2019-05-30',
    tagline: 'Act like you own the place.',
    plot: 'All unemployed, Ki-taek\'s family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.',
    outline: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.',
    runtimeMinutes: 132,
    mpaa: 'Rated R',
    country: 'South Korea',
    studios: ['Barunson E&A', 'CJ Entertainment'],
    genres: ['Comedy', 'Thriller', 'Drama'],
    tags: ['class satire', 'dark comedy', 'oscar best picture'],
    directors: ['Bong Joon-ho'],
    writers: ['Bong Joon-ho', 'Han Jin-won'],
    actors: [
      { name: 'Song Kang-ho', role: 'Kim Ki-taek', order: 0 },
      { name: 'Lee Sun-kyun', role: 'Park Dong-ik', order: 1 },
      { name: 'Cho Yeo-jeong', role: 'Choi Yeon-gyo', order: 2 },
      { name: 'Choi Woo-shik', role: 'Kim Ki-woo', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=5xH0HfJHsaY',
    uniqueIds: { imdb: 'tt6751668', tmdb: '496243', trakt: '372395' },
    ratings: [
      { source: 'imdb', value: 8.5, max: 10, votes: 1010000, isDefault: true },
      { source: 'tmdb', value: 8.5, max: 10, votes: 18200 },
      { source: 'rottentomatoes', value: 99, max: 100, votes: 478 },
      { source: 'metacritic', value: 96, max: 100, votes: 52 },
      { source: 'trakt', value: 8.6, max: 10, votes: 49200 },
    ],
    accentColor: '#16a34a',
    secondaryColor: '#86efac',
  },
  {
    key: 'arrival-2016',
    title: 'Arrival',
    originalTitle: 'Arrival',
    sortTitle: 'Arrival',
    year: 2016,
    premiered: '2016-11-11',
    tagline: 'Why are they here?',
    plot: 'Taking place after alien crafts land around the world, an expert linguist is recruited by the military to determine whether they come in peace or are a threat.',
    outline: 'A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world.',
    runtimeMinutes: 116,
    mpaa: 'Rated PG-13',
    country: 'United States',
    studios: ['21 Laps Entertainment', 'FilmNation Entertainment', 'Paramount Pictures'],
    genres: ['Drama', 'Science Fiction', 'Mystery'],
    tags: ['first contact', 'linguistics', 'time perception'],
    directors: ['Denis Villeneuve'],
    writers: ['Eric Heisserer'],
    actors: [
      { name: 'Amy Adams', role: 'Louise Banks', order: 0 },
      { name: 'Jeremy Renner', role: 'Ian Donnelly', order: 1 },
      { name: 'Forest Whitaker', role: 'Colonel Weber', order: 2 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=tFMo3UJ4B4g',
    uniqueIds: { imdb: 'tt2543164', tmdb: '329865', trakt: '221849' },
    ratings: [
      { source: 'imdb', value: 7.9, max: 10, votes: 794000, isDefault: true },
      { source: 'tmdb', value: 7.6, max: 10, votes: 17700 },
      { source: 'rottentomatoes', value: 94, max: 100, votes: 441 },
      { source: 'metacritic', value: 81, max: 100, votes: 52 },
    ],
    accentColor: '#64748b',
    secondaryColor: '#38bdf8',
  },
  {
    key: 'oppenheimer-2023',
    title: 'Oppenheimer',
    originalTitle: 'Oppenheimer',
    sortTitle: 'Oppenheimer',
    year: 2023,
    premiered: '2023-07-21',
    tagline: 'The world forever changes.',
    plot: 'The story of J. Robert Oppenheimer\'s role in the development of the atomic bomb during World War II.',
    outline: 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
    runtimeMinutes: 181,
    mpaa: 'Rated R',
    country: 'United States',
    studios: ['Syncopy', 'Atlas Entertainment', 'Universal Pictures'],
    genres: ['Drama', 'History'],
    tags: ['biography', 'manhattan project', 'imax 70mm'],
    directors: ['Christopher Nolan'],
    writers: ['Christopher Nolan'],
    actors: [
      { name: 'Cillian Murphy', role: 'J. Robert Oppenheimer', order: 0 },
      { name: 'Emily Blunt', role: 'Katherine "Kitty" Oppenheimer', order: 1 },
      { name: 'Matt Damon', role: 'Leslie Groves', order: 2 },
      { name: 'Robert Downey Jr.', role: 'Lewis Strauss', order: 3 },
    ],
    trailerUrl: 'https://www.youtube.com/watch?v=uYPbbksJxIg',
    uniqueIds: { imdb: 'tt15398776', tmdb: '872585', trakt: '675809' },
    ratings: [
      { source: 'imdb', value: 8.3, max: 10, votes: 812000, isDefault: true },
      { source: 'tmdb', value: 8.1, max: 10, votes: 9200 },
      { source: 'rottentomatoes', value: 93, max: 100, votes: 511 },
      { source: 'metacritic', value: 90, max: 100, votes: 69 },
    ],
    accentColor: '#dc2626',
    secondaryColor: '#fb923c',
  },
];

export const CATALOG_SHOWS: CatalogTvShowEntry[] = [
  {
    key: 'severance',
    title: 'Severance',
    originalTitle: 'Severance',
    sortTitle: 'Severance',
    year: 2022,
    premiered: '2022-02-18',
    status: 'Continuing',
    plot: 'Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives. When a mysterious colleague appears outside of work, it begins a journey to discover the truth about their jobs.',
    mpaa: 'TV-MA',
    studio: 'Apple TV+',
    genres: ['Drama', 'Mystery', 'Science Fiction', 'Thriller'],
    tags: ['corporate dystopia', 'psychological', 'workplace'],
    actors: [
      { name: 'Adam Scott', role: 'Mark Scout', order: 0 },
      { name: 'Britt Lower', role: 'Helly Riggs', order: 1 },
      { name: 'Zach Cherry', role: 'Dylan George', order: 2 },
      { name: 'John Turturro', role: 'Irving Bailiff', order: 3 },
      { name: 'Tramell Tillman', role: 'Seth Milchick', order: 4 },
    ],
    uniqueIds: { imdb: 'tt11280740', tmdb: '95396', tvdb: '371980', tvmaze: '44933', trakt: '154719' },
    ratings: [
      { source: 'imdb', value: 8.7, max: 10, votes: 254000, isDefault: true },
      { source: 'tmdb', value: 8.4, max: 10, votes: 1420 },
      { source: 'rottentomatoes', value: 97, max: 100, votes: 112 },
      { source: 'trakt', value: 8.6, max: 10, votes: 19200 },
    ],
    accentColor: '#0ea5e9',
    secondaryColor: '#a7f3d0',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', overview: 'Macrodata Refinement welcomes a rebellious new employee while Mark uncovers unsettling truths on the outside.' },
      { seasonNumber: 2, name: 'Season 2', overview: 'Mark and his allies confront the aftermath of the Overtime Contingency.' },
    ],
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Good News About Hell',
        aired: '2022-02-18',
        plot: 'Mark is promoted to lead a team whose memories have been surgically split between work and home life.',
        runtimeMinutes: 57,
        directors: ['Ben Stiller'],
        writers: ['Dan Erickson'],
        ratings: [{ source: 'imdb', value: 8.3, max: 10, votes: 9100, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'Half Loop',
        aired: '2022-02-18',
        plot: 'The team trains newcomer Helly on macrodata refinement. Mark takes a day off to meet with a former colleague.',
        runtimeMinutes: 46,
        directors: ['Ben Stiller'],
        writers: ['Dan Erickson'],
        ratings: [{ source: 'imdb', value: 8.2, max: 10, votes: 7600, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 3,
        title: 'In Perpetuity',
        aired: '2022-02-25',
        plot: 'Mark takes the team on a field trip to the Perpetuity Wing to remind Helly why Lumon matters.',
        runtimeMinutes: 54,
        directors: ['Ben Stiller'],
        writers: ['Andrew Colville'],
        ratings: [{ source: 'imdb', value: 8.3, max: 10, votes: 7100, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 4,
        title: 'The You You Are',
        aired: '2022-03-04',
        plot: 'Irving makes an intriguing discovery at Optics & Design while Helly receives a stern warning.',
        runtimeMinutes: 46,
        directors: ['Aoife McArdle'],
        writers: ['Kari Drake'],
        ratings: [{ source: 'imdb', value: 8.5, max: 10, votes: 7300, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 5,
        title: 'The Grim Barbarity of Optics and Design',
        aired: '2022-03-11',
        plot: 'Irving and Dylan confront Burt as Mark helps Helly navigate Lumon secrets.',
        runtimeMinutes: 44,
        directors: ['Aoife McArdle'],
        writers: ['Anna Ouyang Moench'],
        ratings: [{ source: 'imdb', value: 8.1, max: 10, votes: 6900, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 6,
        title: 'Hide and Seek',
        aired: '2022-03-18',
        plot: 'The MDR team angers Cobel by forming an alliance across departments.',
        runtimeMinutes: 46,
        directors: ['Aoife McArdle'],
        writers: ['Amanda Overton'],
        ratings: [{ source: 'imdb', value: 8.5, max: 10, votes: 7600, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 7,
        title: 'Defiant Jazz',
        aired: '2022-03-25',
        plot: 'Milchick hosts a Music Dance Experience for Helly as tensions boil over inside MDR.',
        runtimeMinutes: 50,
        directors: ['Ben Stiller'],
        writers: ['Helen Leigh'],
        ratings: [{ source: 'imdb', value: 9.0, max: 10, votes: 10400, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 8,
        title: 'What\'s for Dinner?',
        aired: '2022-04-01',
        plot: 'The team prepares for the Overtime Contingency while Irving contemplates his retirement.',
        runtimeMinutes: 47,
        directors: ['Ben Stiller'],
        writers: ['Chris Black'],
        ratings: [{ source: 'imdb', value: 9.1, max: 10, votes: 11800, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 9,
        title: 'The We We Are',
        aired: '2022-04-08',
        plot: 'The MDR team puts the Overtime Contingency plan into motion to uncover the truth on the outside.',
        runtimeMinutes: 40,
        directors: ['Ben Stiller'],
        writers: ['Dan Erickson'],
        ratings: [{ source: 'imdb', value: 9.7, max: 10, votes: 21500, isDefault: true }],
      },
      {
        seasonNumber: 2,
        episodeNumber: 1,
        title: 'Hello, Ms. Cobel',
        aired: '2025-01-17',
        plot: 'Mark returns to Lumon under dramatically altered circumstances as management attempts damage control.',
        runtimeMinutes: 53,
        directors: ['Ben Stiller'],
        writers: ['Dan Erickson'],
        ratings: [{ source: 'imdb', value: 8.6, max: 10, votes: 11200, isDefault: true }],
      },
      {
        seasonNumber: 2,
        episodeNumber: 2,
        title: 'Goodbye, Mrs. Selvig',
        aired: '2025-01-24',
        plot: 'Outie Mark grapples with the fallout from the Overtime Contingency as Milchick visits the team.',
        runtimeMinutes: 48,
        directors: ['Sam Donovan'],
        writers: ['Mohamad El Masri'],
        ratings: [{ source: 'imdb', value: 8.7, max: 10, votes: 9800, isDefault: true }],
      },
    ],
  },
  {
    key: 'andor',
    title: 'Andor',
    originalTitle: 'Andor',
    sortTitle: 'Andor',
    year: 2022,
    premiered: '2022-09-21',
    status: 'Continuing',
    plot: 'In an era filled with danger, deception and intrigue, Cassian Andor sets out on a path that is destined to turn him into a rebel hero.',
    mpaa: 'TV-14',
    studio: 'Disney+',
    genres: ['Science Fiction', 'Action', 'Drama', 'Thriller'],
    tags: ['star wars', 'rebellion', 'espionage'],
    actors: [
      { name: 'Diego Luna', role: 'Cassian Andor', order: 0 },
      { name: 'Stellan Skarsgård', role: 'Luthen Rael', order: 1 },
      { name: 'Genevieve O\'Reilly', role: 'Mon Mothma', order: 2 },
      { name: 'Adria Arjona', role: 'Bix Caleen', order: 3 },
    ],
    uniqueIds: { imdb: 'tt9253284', tmdb: '83867', tvdb: '391002', tvmaze: '39618', trakt: '139224' },
    ratings: [
      { source: 'imdb', value: 8.4, max: 10, votes: 186000, isDefault: true },
      { source: 'tmdb', value: 8.2, max: 10, votes: 1380 },
      { source: 'rottentomatoes', value: 96, max: 100, votes: 612 },
    ],
    accentColor: '#d97706',
    secondaryColor: '#38bdf8',
    seasons: [{ seasonNumber: 1, name: 'Season 1', overview: 'Five years before Rogue One, Cassian Andor is pulled into the nascent Rebellion.' }],
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Kassa',
        aired: '2022-09-21',
        plot: 'Cassian Andor\'s reckless search for his missing sister triggers a deadly Corporate Security investigation on Ferrix.',
        runtimeMinutes: 42,
        directors: ['Toby Haynes'],
        writers: ['Tony Gilroy'],
        ratings: [{ source: 'imdb', value: 7.5, max: 10, votes: 10400, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 6,
        title: 'The Eye',
        aired: '2022-10-12',
        plot: 'With cover from a spectacular celestial event, the Aldhani rebel team executes an audacious Imperial payroll heist.',
        runtimeMinutes: 54,
        directors: ['Susanna White'],
        writers: ['Dan Gilroy'],
        ratings: [{ source: 'imdb', value: 9.1, max: 10, votes: 14500, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 10,
        title: 'One Way Out',
        aired: '2022-11-09',
        plot: 'A rare opportunity on Narkina 5 pushes Cassian and Kino Loy to mobilize the entire prison complex.',
        runtimeMinutes: 48,
        directors: ['Toby Haynes'],
        writers: ['Beau Willimon'],
        ratings: [{ source: 'imdb', value: 9.5, max: 10, votes: 22100, isDefault: true }],
      },
    ],
  },
  {
    key: 'arcane',
    title: 'Arcane',
    originalTitle: 'Arcane',
    sortTitle: 'Arcane',
    year: 2021,
    premiered: '2021-11-06',
    status: 'Ended',
    plot: 'Amid the stark discord of twin cities Piltover and Zaun, two sisters fight on rival sides of a war between magic technologies and clashing convictions.',
    mpaa: 'TV-14',
    studio: 'Netflix',
    genres: ['Animation', 'Science Fiction', 'Action', 'Drama'],
    tags: ['steampunk', 'animation', 'sisters', 'fortiche'],
    actors: [
      { name: 'Hailee Steinfeld', role: 'Vi (voice)', order: 0 },
      { name: 'Ella Purnell', role: 'Jinx (voice)', order: 1 },
      { name: 'Kevin Alejandro', role: 'Jayce Talis (voice)', order: 2 },
    ],
    uniqueIds: { imdb: 'tt11126994', tmdb: '94605', tvdb: '371028', trakt: '153404' },
    ratings: [
      { source: 'imdb', value: 9.0, max: 10, votes: 342000, isDefault: true },
      { source: 'tmdb', value: 8.7, max: 10, votes: 4600 },
      { source: 'rottentomatoes', value: 100, max: 100, votes: 68 },
    ],
    accentColor: '#7c3aed',
    secondaryColor: '#f43f5e',
    seasons: [
      { seasonNumber: 1, name: 'Season 1', overview: 'Orphaned sisters Vi and Powder find their paths diverging in Piltover and the undercity of Zaun.' },
    ],
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Welcome to the Playground',
        aired: '2021-11-06',
        plot: 'Orphaned sisters Vi and Powder bring trouble to Zaun\'s underground streets in the wake of a heist in posh Piltover.',
        runtimeMinutes: 43,
        directors: ['Pascal Charrue', 'Arnaud Delord'],
        writers: ['Christian Linke', 'Alex Yee'],
        ratings: [{ source: 'imdb', value: 8.5, max: 10, votes: 14800, isDefault: true }],
      },
      {
        seasonNumber: 1,
        episodeNumber: 3,
        title: 'The Base Violence Necessary for Change',
        aired: '2021-11-06',
        plot: 'An epic showdown between old rivals results in a fateful moment for Zaun. Jayce and Viktor take a huge risk.',
        runtimeMinutes: 44,
        directors: ['Pascal Charrue', 'Arnaud Delord'],
        writers: ['Ash Brannon'],
        ratings: [{ source: 'imdb', value: 9.7, max: 10, votes: 31200, isDefault: true }],
      },
    ],
  },
  {
    key: 'breaking-bad',
    title: 'Breaking Bad',
    originalTitle: 'Breaking Bad',
    sortTitle: 'Breaking Bad',
    year: 2008,
    premiered: '2008-01-20',
    status: 'Ended',
    plot: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student to secure his family\'s future.',
    mpaa: 'TV-MA',
    studio: 'AMC',
    genres: ['Crime', 'Drama', 'Thriller'],
    tags: ['antihero', 'chemistry', 'albuquerque', 'cartel'],
    actors: [
      { name: 'Bryan Cranston', role: 'Walter White', order: 0 },
      { name: 'Aaron Paul', role: 'Jesse Pinkman', order: 1 },
      { name: 'Anna Gunn', role: 'Skyler White', order: 2 },
      { name: 'Bob Odenkirk', role: 'Saul Goodman', order: 3 },
    ],
    uniqueIds: { imdb: 'tt0903747', tmdb: '1396', tvdb: '81189', tvmaze: '169', trakt: '1388' },
    ratings: [
      { source: 'imdb', value: 9.5, max: 10, votes: 2250000, isDefault: true },
      { source: 'tmdb', value: 8.9, max: 10, votes: 14700 },
      { source: 'rottentomatoes', value: 96, max: 100, votes: 254 },
      { source: 'metacritic', value: 87, max: 100, votes: 96 },
    ],
    accentColor: '#16a34a',
    secondaryColor: '#facc15',
    seasons: [{ seasonNumber: 1, name: 'Season 1', overview: 'Walter White begins cooking crystal meth with Jesse Pinkman.' }],
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'Pilot',
        aired: '2008-01-20',
        plot: 'Diagnosed with terminal lung cancer, chemistry teacher Walter White teams up with former student Jesse Pinkman to cook crystal meth.',
        runtimeMinutes: 58,
        directors: ['Vince Gilligan'],
        writers: ['Vince Gilligan'],
        ratings: [{ source: 'imdb', value: 9.0, max: 10, votes: 49200, isDefault: true }],
      },
    ],
  },
  {
    key: 'attack-on-titan',
    title: 'Attack on Titan',
    originalTitle: '進撃の巨人',
    sortTitle: 'Attack on Titan',
    year: 2013,
    premiered: '2013-04-07',
    status: 'Ended',
    plot: 'Several hundred years ago, humans were nearly exterminated by titans. A small percentage of humanity survived by walling themselves in a city protected by extremely high walls.',
    mpaa: 'TV-MA',
    studio: 'Wit Studio / MAPPA',
    genres: ['Animation', 'Action', 'Drama', 'Fantasy'],
    tags: ['anime', 'dark fantasy', 'shonen'],
    actors: [
      { name: 'Yuki Kaji', role: 'Eren Yeager (voice)', order: 0 },
      { name: 'Yui Ishikawa', role: 'Mikasa Ackerman (voice)', order: 1 },
      { name: 'Marina Inoue', role: 'Armin Arlert (voice)', order: 2 },
    ],
    uniqueIds: { imdb: 'tt2560140', tmdb: '1429', tvdb: '267440', mal: '16498', anidb: '9541' },
    ratings: [
      { source: 'imdb', value: 9.1, max: 10, votes: 575000, isDefault: true },
      { source: 'mal', value: 8.55, max: 10, votes: 2800000 },
      { source: 'tmdb', value: 8.7, max: 10, votes: 6400 },
    ],
    accentColor: '#b91c1c',
    secondaryColor: '#f59e0b',
    seasons: [{ seasonNumber: 1, name: 'Season 1', overview: 'The breach of Wall Maria sends Eren Yeager into the Survey Corps.' }],
    episodes: [
      {
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'To You, in 2000 Years: The Fall of Shiganshina, Part 1',
        aired: '2013-04-07',
        plot: 'After 100 years of peace, humanity is suddenly reminded of the terror of being at the Titans\' mercy.',
        runtimeMinutes: 24,
        directors: ['Tetsuro Araki'],
        writers: ['Yasuko Kobayashi'],
        ratings: [{ source: 'imdb', value: 9.0, max: 10, votes: 26500, isDefault: true }],
      },
    ],
  },
];

export function buildCatalogArtworkCandidates(
  title: string,
  year: number | null,
  genres: string[],
  rating: number | null,
  accentColor?: string,
  secondaryColor?: string
): ArtworkCandidate[] {
  const qs = new URLSearchParams({
    title,
    year: year ? String(year) : '',
    genres: genres.slice(0, 3).join(','),
    rating: rating ? String(rating) : '',
    accent: accentColor ?? '',
    secondary: secondaryColor ?? '',
  });
  const base = qs.toString();
  return [
    { kind: 'poster', url: `/api/artwork/render?kind=poster&${base}`, provider: 'tmdb', width: 500, height: 750, label: 'TMDb Official Poster (500x750)' },
    { kind: 'poster', url: `/api/artwork/render?kind=poster&${base}&variant=alt`, provider: 'fanarttv', width: 1000, height: 1500, label: 'Fanart.tv Alt Keyart (1000x1500)' },
    { kind: 'fanart', url: `/api/artwork/render?kind=fanart&${base}`, provider: 'tmdb', width: 1920, height: 1080, label: 'TMDb 1080p Backdrop' },
    { kind: 'fanart', url: `/api/artwork/render?kind=fanart&${base}&variant=alt`, provider: 'fanarttv', width: 1920, height: 1080, label: 'Fanart.tv Alt Backdrop' },
    { kind: 'clearlogo', url: `/api/artwork/render?kind=clearlogo&${base}`, provider: 'fanarttv', width: 800, height: 310, label: 'Fanart.tv HD ClearLOGO (PNG)' },
    { kind: 'clearlogo', url: `/api/artwork/render?kind=clearlogo&${base}&variant=alt`, provider: 'tmdb', width: 800, height: 310, label: 'TMDb Alt ClearLOGO (PNG)' },
    { kind: 'clearart', url: `/api/artwork/render?kind=clearart&${base}`, provider: 'fanarttv', width: 800, height: 450, label: 'Fanart.tv HD ClearART (PNG)' },
    { kind: 'banner', url: `/api/artwork/render?kind=banner&${base}`, provider: 'fanarttv', width: 1000, height: 185, label: 'Fanart.tv Wide Banner' },
    { kind: 'banner', url: `/api/artwork/render?kind=banner&${base}&variant=alt`, provider: 'tvdb', width: 1000, height: 185, label: 'Alt Wide Banner' },
    { kind: 'disc', url: `/api/artwork/render?kind=disc&${base}`, provider: 'fanarttv', width: 600, height: 600, label: 'Fanart.tv Optical DiscART (PNG)' },
    { kind: 'landscape', url: `/api/artwork/render?kind=landscape&${base}`, provider: 'fanarttv', width: 960, height: 540, label: 'Fanart.tv 16:9 Landscape Thumb' },
    { kind: 'landscape', url: `/api/artwork/render?kind=landscape&${base}&variant=alt`, provider: 'tmdb', width: 960, height: 540, label: 'TMDb Alt 16:9 Landscape' },
  ];
}

export function normalizeLookupText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findCatalogMovies(query: string, year?: number | null): Array<{ entry: CatalogMovieEntry; score: number }> {
  const nq = normalizeLookupText(query);
  if (!nq) return CATALOG_MOVIES.map((entry) => ({ entry, score: 0.7 }));

  const qTokens = new Set(nq.split(' '));
  return CATALOG_MOVIES.map((entry) => {
    const nt = normalizeLookupText(entry.title);
    let score = 0;
    if (nt === nq) score = 0.98;
    else if (nt.includes(nq) || nq.includes(nt)) score = 0.85;
    else {
      const tTokens = nt.split(' ');
      const overlap = tTokens.filter((t) => qTokens.has(t)).length;
      score = overlap / Math.max(tTokens.length, qTokens.size);
    }
    if (year && entry.year === year) score = Math.min(1, score + 0.08);
    return { entry, score };
  })
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score);
}

export function findCatalogShows(query: string, year?: number | null): Array<{ entry: CatalogTvShowEntry; score: number }> {
  const nq = normalizeLookupText(query);
  if (!nq) return CATALOG_SHOWS.map((entry) => ({ entry, score: 0.7 }));

  const qTokens = new Set(nq.split(' '));
  return CATALOG_SHOWS.map((entry) => {
    const nt = normalizeLookupText(entry.title);
    let score = 0;
    if (nt === nq) score = 0.98;
    else if (nt.includes(nq) || nq.includes(nt)) score = 0.85;
    else {
      const tTokens = nt.split(' ');
      const overlap = tTokens.filter((t) => qTokens.has(t)).length;
      score = overlap / Math.max(tTokens.length, qTokens.size);
    }
    if (year && entry.year === year) score = Math.min(1, score + 0.08);
    return { entry, score };
  })
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score);
}
