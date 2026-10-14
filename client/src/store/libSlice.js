import { createSlice } from '@reduxjs/toolkit';
import { searchProducts, fetchFacets, fetchGlossary, scrapeUrls } from './thunks.js';

const slice = createSlice({
  name: 'lib',
  initialState: {
    q: '', type: '', source: '', project: '',
    results: [], status: 'idle', error: '',
    facets: { types: [], sources: [], projects: [] },
    glossary: { kind: 'room', rows: [], status: 'idle' },
    scrape: { status: 'idle', results: [] },
  },
  reducers: {
    setQuery: (s, { payload }) => { s.q = payload; },
    setFilter: (s, { payload: { key, value } }) => { s[key] = value; },
    setGlossaryKind: (s, { payload }) => { s.glossary.kind = payload; },
  },
  extraReducers: (b) => {
    b.addCase(searchProducts.pending, (s) => { s.status = 'loading'; });
    b.addCase(searchProducts.fulfilled, (s, { payload }) => { s.status = 'ok'; s.results = payload; s.error = ''; });
    b.addCase(searchProducts.rejected, (s, { error }) => { s.status = 'error'; s.error = error.message; });
    b.addCase(fetchFacets.fulfilled, (s, { payload }) => { s.facets = payload; });
    b.addCase(fetchGlossary.pending, (s) => { s.glossary.status = 'loading'; });
    b.addCase(fetchGlossary.fulfilled, (s, { payload }) => { s.glossary.rows = payload; s.glossary.status = 'ok'; });
    b.addCase(scrapeUrls.pending, (s) => { s.scrape.status = 'loading'; s.scrape.results = []; });
    b.addCase(scrapeUrls.fulfilled, (s, { payload }) => { s.scrape.status = 'ok'; s.scrape.results = payload; });
    b.addCase(scrapeUrls.rejected, (s, { error }) => { s.scrape.status = 'error'; s.scrape.results = [{ url: '', ok: false, error: error.message }]; });
  },
});

export const libActions = slice.actions;
export default slice.reducer;
