declare global {
    interface SignInFormData {
        email: string;
        password: string;
    }

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    interface WelcomeEmailData {
        email: string;
        name: string;
        intro: string;
    }

    type User = {
        id: string;
        name: string;
        email: string;
    };

    //
    type StockData = {
        symbol: string;
        company: string;
        price: string;
        change: string;
        marketCap: string;
        peRatio: string;
        eps: string;
        sentiment: string;
    };

    type PaginationInfo = {
        currentPage: number;
        totalPages: number;
        totalItems: number;
        itemsPerPage: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };

    type StocksResponse = {
        data: StockData[];
        pagination: PaginationInfo;
    };

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image: string;
    };

    type WatchlistNewsProps = {
        watchlistSymbols?: string[]; // Array of stock symbols to fetch news for
        watchlistStocks?: StockWithData[]; // Array of watchlist stocks with full data
        articlesPerStock?: number; // Number of articles per stock
        initialNews?: MarketNewsArticle[]; // Initial news data
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
    };




    type RecommendationData = {
        strongBuy: number;
        buy: number;
        hold: number;
        sell: number;
        strongSell: number;
        period: string;
        symbol: string;
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type StockDetailsData = {
        // Basic Information
        symbol: string;
        company: string;
        exchange: string;
        currency: string;
        country: string;

        // Price Information
        currentPrice: number;
        previousClose: number;
        dayHigh: number;
        dayLow: number;
        openPrice: number;

        // Calculated Metrics
        changeAmount: number;
        changePercent: number;
        priceFormatted: string;
        changeFormatted: string;
        changeAmountFormatted: string;

        // Company Information
        marketCap: number;
        marketCapFormatted: string;
        sharesOutstanding: number;

        // Additional Data
        industry: string;
        website: string;
        logo: string;
        ipo: string;
        phone: string;

        // Financial Metrics
        peRatio: string;
        eps: string;
        sentiment: string;

        // Metadata
        lastUpdated: string;
    };

    type StockDetailsProps = {
        symbol: string | null;
        onClose: () => void;
        open: boolean;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type UserForNewsEmail = {
        id: string;
        email: string;
        name: string;
        country: string;
        investmentGoals?: string;
        riskTolerance?: string;
        preferredIndustry?: string;
    };


    type StockWithData = {
        _id: string;
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        changeAmount?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        changeAmountFormatted?: string;
        marketCap?: string;
        peRatio?: string;
        tradingViewSymbol?: string;
        // Finnhub's time for the price and when we received it (ms), whether it came from our cache because a
        // fresh copy couldn't be fetched, and why it's missing
        quoteTime?: number;
        receivedAt?: number;
        cached?: boolean;
        checkedAt?: number;
        issue?: 'not-configured' | 'auth' | 'rate-limit' | 'busy' | 'provider' | 'network';
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        register: UseFormRegister<any>;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        control: Control<any, any, any>;
        error?: FieldError;
        required?: boolean;
    };


    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

}

export {};
