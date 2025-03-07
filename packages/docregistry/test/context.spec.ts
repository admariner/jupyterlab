// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { UUID } from '@lumino/coreutils';

import { Contents, ServiceManager } from '@jupyterlab/services';

import { Widget } from '@lumino/widgets';

import {
  Context,
  DocumentRegistry,
  TextModelFactory
} from '@jupyterlab/docregistry';

import { RenderMimeRegistry } from '@jupyterlab/rendermime';

import {
  waitForDialog,
  acceptDialog,
  dismissDialog,
  initNotebookContext,
  NBTestUtils
} from '@jupyterlab/testutils';
import { SessionContext } from '@jupyterlab/apputils';

import * as Mock from '@jupyterlab/testutils/lib/mock';

describe('docregistry/context', () => {
  let manager: ServiceManager.IManager;
  const factory = new TextModelFactory();

  beforeAll(() => {
    manager = new Mock.ServiceManagerMock();
    return manager.ready;
  });

  describe('Context', () => {
    let context: Context<DocumentRegistry.IModel>;

    beforeEach(() => {
      context = new Context({
        manager,
        factory,
        path: UUID.uuid4() + '.txt'
      });
    });

    afterEach(async () => {
      await context.sessionContext.shutdown();
      context.dispose();
    });

    describe('#constructor()', () => {
      it('should create a new context', () => {
        context = new Context({
          manager,
          factory,
          path: UUID.uuid4() + '.txt'
        });
        expect(context).toBeInstanceOf(Context);
      });
    });

    describe('#pathChanged', () => {
      it('should be emitted when the path changes', async () => {
        const newPath = UUID.uuid4() + '.txt';
        let called = false;
        context.pathChanged.connect((sender, args) => {
          expect(sender).toBe(context);
          expect(args).toBe(newPath);
          called = true;
        });
        await context.initialize(true);
        await manager.contents.rename(context.path, newPath);
        expect(called).toBe(true);
      });
    });

    describe('#fileChanged', () => {
      it('should be emitted when the file is saved', async () => {
        const path = context.path;
        let called = false;
        context.fileChanged.connect((sender, args) => {
          expect(sender).toBe(context);
          expect(args.path).toBe(path);
          called = true;
        });
        await context.initialize(true);
        expect(called).toBe(true);
      });
    });

    describe('#saving', () => {
      it("should emit 'starting' when the file starts saving", async () => {
        let called = false;
        let checked = false;
        context.saveState.connect((sender, args) => {
          if (!called) {
            expect(sender).toBe(context);
            expect(args).toBe('started');

            checked = true;
          }

          called = true;
        });

        await context.initialize(true);
        expect(called).toBe(true);
        expect(checked).toBe(true);
      });

      it("should emit 'completed' when the file ends saving", async () => {
        let called = 0;
        let checked = false;
        context.saveState.connect((sender, args) => {
          if (called > 0) {
            expect(sender).toBe(context);
            expect(args).toBe('completed');
            checked = true;
          }

          called += 1;
        });

        await context.initialize(true);
        expect(called).toBe(2);
        expect(checked).toBe(true);
      });

      it("should emit 'failed' when the save operation fails out", async () => {
        context = new Context({
          manager,
          factory,
          path: 'readonly.txt'
        });

        let called = 0;
        let checked;
        context.saveState.connect((sender, args) => {
          if (called > 0) {
            expect(sender).toBe(context);
            checked = args;
          }

          called += 1;
        });

        await expect(context.initialize(true)).rejects.toThrowError(
          'Invalid response: 403 Forbidden'
        );
        expect(called).toBe(2);
        expect(checked).toBe('failed');

        await acceptDialog();
      });
    });

    describe('#isReady', () => {
      it('should indicate whether the context is ready', async () => {
        expect(context.isReady).toBe(false);
        const func = async () => {
          await context.ready;
          expect(context.isReady).toBe(true);
        };
        const promise = func();
        await context.initialize(true);
        await promise;
      });
    });

    describe('#ready()', () => {
      it('should resolve when the file is saved for the first time', async () => {
        await context.initialize(true);
        await context.ready;
      });

      it('should resolve when the file is reverted for the first time', async () => {
        await manager.contents.save(context.path, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo'
        });
        await context.initialize(false);
        await context.ready;
      });

      it('should initialize the model when the file is saved for the first time', async () => {
        const context = await initNotebookContext({ manager });
        context.model.fromJSON(NBTestUtils.DEFAULT_CONTENT);
        expect(context.model.cells.canUndo).toBe(true);
        await context.initialize(true);
        await context.ready;
        expect(context.model.cells.canUndo).toBe(false);
      });

      it('should initialize the model when the file is reverted for the first time', async () => {
        const context = await initNotebookContext({ manager });
        await manager.contents.save(context.path, {
          type: 'notebook',
          format: 'json',
          content: NBTestUtils.DEFAULT_CONTENT
        });
        context.model.fromJSON(NBTestUtils.DEFAULT_CONTENT);
        expect(context.model.cells.canUndo).toBe(true);
        await context.initialize(false);
        await context.ready;
        expect(context.model.cells.canUndo).toBe(false);
      });
    });

    describe('#disposed', () => {
      it('should be emitted when the context is disposed', () => {
        let called = false;
        context.disposed.connect((sender, args) => {
          expect(sender).toBe(context);
          expect(args).toBeUndefined();
          called = true;
        });
        context.dispose();
        expect(called).toBe(true);
      });
    });

    describe('#model', () => {
      it('should be the model associated with the document', () => {
        expect(context.model.toString()).toBe('');
      });
    });

    describe('#sessionContext', () => {
      it('should be a ISessionContext object', () => {
        expect(context.sessionContext).toBeInstanceOf(SessionContext);
      });
    });

    describe('#path', () => {
      it('should be the current path for the context', () => {
        expect(typeof context.path).toBe('string');
      });
    });

    describe('#contentsModel', () => {
      it('should be `null` before population', () => {
        expect(context.contentsModel).toBeNull();
      });

      it('should be set after population', async () => {
        const { path } = context;

        void context.initialize(true);
        await context.ready;
        expect(context.contentsModel!.path).toBe(path);
      });
    });

    describe('#factoryName', () => {
      it('should be the name of the factory used by the context', () => {
        expect(context.factoryName).toBe(factory.name);
      });
    });

    describe('#isDisposed', () => {
      it('should test whether the context is disposed', () => {
        expect(context.isDisposed).toBe(false);
        context.dispose();
        expect(context.isDisposed).toBe(true);
      });
    });

    describe('#dispose()', () => {
      it('should dispose of the resources used by the context', () => {
        context.dispose();
        expect(context.isDisposed).toBe(true);
        context.dispose();
        expect(context.isDisposed).toBe(true);
      });
    });

    describe('#rename()', () => {
      it('should change the name of the file to the new name', async () => {
        await context.initialize(true);
        context.model.fromString('foo');

        const newName = UUID.uuid4() + '.txt';

        await context.rename(newName);
        await context.save();

        const opts: Contents.IFetchOptions = {
          format: factory.fileFormat,
          type: factory.contentType,
          content: true
        };

        const model = await manager.contents.get(newName, opts);

        expect(model.content).toBe('foo');
      });
    });

    describe('#save()', () => {
      it('should save the contents of the file to disk', async () => {
        await context.initialize(true);
        context.model.fromString('foo');
        await context.save();

        const opts: Contents.IFetchOptions = {
          format: factory.fileFormat,
          type: factory.contentType,
          content: true
        };
        const model = await manager.contents.get(context.path, opts);

        expect(model.content).toBe('foo');
      });

      it('should should preserve LF line endings upon save', async () => {
        await context.initialize(true);
        await manager.contents.save(context.path, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo\nbar'
        });
        await context.revert();
        await context.save();
        const opts: Contents.IFetchOptions = {
          format: factory.fileFormat,
          type: factory.contentType,
          content: true
        };
        const model = await manager.contents.get(context.path, opts);
        expect(model.content).toBe('foo\nbar');
      });

      it('should should preserve CRLF line endings upon save', async () => {
        await context.initialize(true);
        await manager.contents.save(context.path, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo\r\nbar'
        });
        await context.revert();
        await context.save();
        const opts: Contents.IFetchOptions = {
          format: factory.fileFormat,
          type: factory.contentType,
          content: true
        };
        const model = await manager.contents.get(context.path, opts);
        expect(model.content).toBe('foo\r\nbar');
      });
    });

    describe('#saveAs()', () => {
      it('should save the document to a different path chosen by the user', async () => {
        const initialize = context.initialize(true);
        const newPath = UUID.uuid4() + '.txt';

        const func = async () => {
          await initialize;
          await waitForDialog();
          const dialog = document.body.getElementsByClassName('jp-Dialog')[0];
          const input = dialog.getElementsByTagName('input')[0];

          input.value = newPath;
          await acceptDialog();
        };
        const promise = func();
        await initialize;

        const oldPath = context.path;
        await context.saveAs();
        await promise;
        expect(context.path).toBe(newPath);
        // Make sure the both files are there now.
        const model = await manager.contents.get('', { content: true });
        expect(model.content.find((x: any) => x.name === oldPath)).toBeTruthy();
        expect(model.content.find((x: any) => x.name === newPath)).toBeTruthy();
      });

      it('should bring up a conflict dialog', async () => {
        const newPath = UUID.uuid4() + '.txt';

        const func = async () => {
          await waitForDialog();
          const dialog = document.body.getElementsByClassName('jp-Dialog')[0];
          const input = dialog.getElementsByTagName('input')[0];
          input.value = newPath;
          await acceptDialog(); // Accept rename dialog
          await acceptDialog(); // Accept conflict dialog
        };
        await manager.contents.save(newPath, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo'
        });
        await context.initialize(true);
        const promise = func();
        await context.saveAs();
        await promise;
        expect(context.path).toBe(newPath);
      });

      it('should keep the file if overwrite is aborted', async () => {
        const oldPath = context.path;
        const newPath = UUID.uuid4() + '.txt';
        const func = async () => {
          await waitForDialog();
          const dialog = document.body.getElementsByClassName('jp-Dialog')[0];
          const input = dialog.getElementsByTagName('input')[0];
          input.value = newPath;
          await acceptDialog(); // Accept rename dialog
          await dismissDialog(); // Reject conflict dialog
        };
        await manager.contents.save(newPath, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo'
        });
        await context.initialize(true);
        const promise = func();
        await context.saveAs();
        await promise;
        expect(context.path).toBe(oldPath);
      });

      it('should just save if the file name does not change', async () => {
        const path = context.path;
        await context.initialize(true);
        const promise = context.saveAs();
        await acceptDialog();
        await promise;
        expect(context.path).toBe(path);
      });
    });

    describe('#revert()', () => {
      it('should revert the contents of the file to the disk', async () => {
        await context.initialize(true);
        context.model.fromString('foo');
        await context.save();
        context.model.fromString('bar');
        await context.revert();
        expect(context.model.toString()).toBe('foo');
      });

      it('should normalize CRLF line endings to LF', async () => {
        await context.initialize(true);
        await manager.contents.save(context.path, {
          type: factory.contentType,
          format: factory.fileFormat,
          content: 'foo\r\nbar'
        });
        await context.revert();
        expect(context.model.toString()).toBe('foo\nbar');
      });
    });

    describe('#createCheckpoint()', () => {
      it('should create a checkpoint for the file', async () => {
        await context.initialize(true);
        const model = await context.createCheckpoint();
        expect(model.id).toBeTruthy();
        expect(model.last_modified).toBeTruthy();
      });
    });

    describe('#deleteCheckpoint()', () => {
      it('should delete the given checkpoint', async () => {
        await context.initialize(true);
        const model = await context.createCheckpoint();
        await context.deleteCheckpoint(model.id);
        const models = await context.listCheckpoints();
        expect(models.length).toBe(0);
      });
    });

    describe('#restoreCheckpoint()', () => {
      it('should restore the value to the last checkpoint value', async () => {
        context.model.fromString('bar');
        await context.initialize(true);
        const model = await context.createCheckpoint();
        context.model.fromString('foo');
        const id = model.id;
        await context.save();
        await context.restoreCheckpoint(id);
        await context.revert();
        expect(context.model.toString()).toBe('bar');
      });
    });

    describe('#listCheckpoints()', () => {
      it('should list the checkpoints for the file', async () => {
        await context.initialize(true);
        const model = await context.createCheckpoint();
        const id = model.id;
        const models = await context.listCheckpoints();
        let found = false;
        for (const model of models) {
          if (model.id === id) {
            found = true;
          }
        }
        expect(found).toBe(true);
      });
    });

    describe('#urlResolver', () => {
      it('should be a url resolver', () => {
        expect(context.urlResolver).toBeInstanceOf(
          RenderMimeRegistry.UrlResolver
        );
      });
    });

    describe('#addSibling()', () => {
      it('should add a sibling widget', () => {
        let called = false;
        const opener = (widget: Widget) => {
          called = true;
        };
        context = new Context({
          manager,
          factory,
          path: UUID.uuid4() + '.txt',
          opener
        });
        context.addSibling(new Widget());
        expect(called).toBe(true);
      });
    });
  });
});
