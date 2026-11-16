import { plugin } from 'bun';
import { shallot } from '@dylanebert/shallot/bun';
plugin(shallot({ root: new URL('..', import.meta.url).pathname }));
