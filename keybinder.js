const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;
const Main = imports.ui.main;

/**
 * Manages a set of keybindings identified by an ID.
 *
 * GNOME Shell can only apply new configuration entries from a compiled schema
 * file. When applying the keybinds, a schema is generated and compiled with
 * the "glib-compile-schemas" executable, then loaded and applied.
 *
 * @see {@link add}
 * @see {@link apply}
 * @see {@link unapply}
 */
export default class Keybinder {

  /**
   * @param {String} id the ID of the keybinding set.
   */
  constructor(id, directory=GLib.get_tmp_dir()) {
    this.id = id;
    this.directory = directory;
    this.bindings = [];
  }

  /**
   * Adds a keybinding.
   *
   * @param {String} name the unique name of the binding.
   * @param {String|Array<String>} sequences the key sequence(s).
   * @param {Function} handler the handler.
   */
  add(name, sequences, handler) {
    sequences = sequences instanceof Array ? sequences : [sequences];
    this.bindings.push({name: name, sequences: sequences, handler: handler});
  }

  /**
   * Renders a keybinding to an XML gschema entry.
   *
   * @private
   * @param {String} name the name of the binding.
   * @param {Array<String>} sequences the key sequences.
   * @return {String} the rendered entry.
   */
  render({name, sequences}) {
    const value = sequences.map(s => GLib.markup_escape_text(s, s.length));
    const markup = `<default>${JSON.stringify(value)}</default>`;
    return `<key type="as" name="${name}"><summary/>${markup}</key>`;
  }

  /**
   * Builds the XML gschema entry and writes it into a file.
   *
   * @private
   */
  build() {
    const entries = this.bindings.map(b => this.render(b)).join('');
    const schema = `<schema id="${this.id}" path="/">${entries}</schema>`;
    const content = `<schemalist>${schema}</schemalist>`;
    Gio.file_new_for_path(this.dir).get_child(`${this.id}.gschema.xml`)
      .replace_contents(content, null, false, 0, null);
  }

  /**
   * Compiles the XML gschema file.
   *
   * @private
   */
  compile() {
    const exec = ['glib-compile-schemas', this.dir];
    GLib.spawn_sync(this.dir, exec, null, GLib.SpawnFlags.SEARCH_PATH, null);
  }

  /**
   * Loads the compiled gschema file.
   *
   * @private
   * @return {Gio.Settings} a settings object.
   */
  load() {
    const fb = Gio.SettingsSchemaSource.get_default();
    const src = Gio.SettingsSchemaSource.new_from_directory(this.dir, fb, false);
    return new Gio.Settings({settings_schema: src.lookup(this.id, true)});
  }

  /**
   * Applies the keybindings.
   *
   * @throws {Error} when writing to the XML gschema file, compiling it,
   * loading the settings, or applying a keybinding fails.
   */
  apply() {
    this.build();
    this.compile();
    const settings = this.load();
    const modes = Shell.ActionMode.NORMAL | Shell.ActionMode.MESSAGE_TRAY;
    for (let {name, handler} of this.bindings)
      Main.wm.addKeybinding(name, settings, 0, modes, handler);
  }

  /**
   * Unapplies the keybindings.
   */
  unapply() {
    for (let {name} of this.bindings)
      Main.wm.removeKeybinding(name);
  }
}