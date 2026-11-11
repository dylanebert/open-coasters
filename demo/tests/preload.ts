import { plugin } from 'bun';
import { setDefaultTimeout } from 'bun:test';
import { TIMEOUT } from '@dylanebert/shallot/testing';
import { shallot } from '@dylanebert/shallot/bun';
plugin(shallot({ root: import.meta.dir }));
setDefaultTimeout(TIMEOUT.cheap);
