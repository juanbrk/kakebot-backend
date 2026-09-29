export interface BuildTwoColumnRowsParams<T> {
  items: T[];
  buttonLabel: (item: T) => string;
  buttonCallback: (item: T) => string;
}

export interface BuildPaginatedKeyboardRowsParams<T> extends BuildTwoColumnRowsParams<T> {
  page: number;
  perPage: number;
  navCallback: (navPage: number) => string;
}
